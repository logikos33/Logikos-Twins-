#!/usr/bin/env python3
"""Gera a cena sintética — a peça-chave do desenvolvimento sem GPU.

Uma "sala" de dimensões EXATAS conhecidas por construção (6 × 4 × 3 unidades), com
paredes, piso, objetos-caixa em posições declaradas, e uma trajetória de câmera circular.
Produz:

  (a) NPZs por frame no MESMO schema que o LingBot-Map grava com --save_predictions
      (plano §3.3): world_points, world_points_conf, depth, depth_conf, extrinsic (c2w),
      intrinsic, images — é com eles que o worker (D3) e a desprojeção (D5) são testados;
  (b) os artefatos prontos que o modo synthetic do fake-runpod publica:
      cloud_preview.ply (binário), poses.json, meta.json, keyframes/*.jpg, thumb.jpg.

Como as dimensões são conhecidas, a cena é um TESTE: a parede tem 6,0 unidades; se a
medição do viewer (D4) calibrada der outra coisa, o bug é nosso e o teste pega.

Depende apenas de numpy — roda no Python 3.14 do host sem open3d (ver DECISIONS.md).
O PLY binário é escrito à mão (formato trivial); o JPEG dos keyframes usa um encoder
mínimo sem dependências.

Uso:
    python scripts/make_fixture.py --out fixtures [--frames 48] [--seed 7]
"""

from __future__ import annotations

import argparse
import json
import struct
import zlib
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# A sala — TODAS as dimensões em "unidades de cena" (a escala real chega na D4
# via calibração; aqui o que importa é a geometria ser exata)
# ---------------------------------------------------------------------------

ROOM = {"x": 6.0, "y": 4.0, "z": 3.0}  # comprimento, largura, altura

# Objetos-caixa: nome → (centro, tamanho). Posições DECLARADAS: o teste de
# desprojeção da D5 procura cada objeto exatamente onde ele foi plantado.
OBJECTS: dict[str, tuple[tuple[float, float, float], tuple[float, float, float]]] = {
    "mesa": ((1.5, 1.0, 0.4), (1.2, 0.8, 0.8)),
    "armario": ((5.2, 3.4, 1.0), (0.8, 0.6, 2.0)),
    "caixa_chao": ((3.0, 2.8, 0.25), (0.5, 0.5, 0.5)),
}

# Cores RGB por superfície, para a nuvem não ser um borrão cinza no viewer.
COLORS = {
    "floor": (110, 100, 90),
    "wall_x0": (170, 160, 150),
    "wall_x1": (160, 150, 140),
    "wall_y0": (150, 145, 135),
    "wall_y1": (145, 140, 130),
    "mesa": (140, 90, 50),
    "armario": (60, 70, 120),
    "caixa_chao": (180, 150, 60),
}

IMG_W, IMG_H = 518, 388  # resolução de inferência do motor (lado maior 518)


# ---------------------------------------------------------------------------
# Geometria — funções puras
# ---------------------------------------------------------------------------


def sample_plane(
    origin: np.ndarray,
    u_vec: np.ndarray,
    v_vec: np.ndarray,
    density: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """Amostra pontos uniformes num paralelogramo origin + s·u + t·v."""
    area = float(np.linalg.norm(np.cross(u_vec, v_vec)))
    n = max(1, int(area * density))
    s = rng.random(n)
    t = rng.random(n)
    return origin[None, :] + s[:, None] * u_vec[None, :] + t[:, None] * v_vec[None, :]


def box_surface(
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    density: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """Amostra a superfície de uma caixa alinhada aos eixos."""
    cx, cy, cz = center
    sx, sy, sz = size
    x0, x1 = cx - sx / 2, cx + sx / 2
    y0, y1 = cy - sy / 2, cy + sy / 2
    z0, z1 = cz - sz / 2, cz + sz / 2
    faces = [
        # (origem, u, v) — as 6 faces
        (np.array([x0, y0, z0]), np.array([sx, 0, 0]), np.array([0, sy, 0])),  # baixo
        (np.array([x0, y0, z1]), np.array([sx, 0, 0]), np.array([0, sy, 0])),  # topo
        (np.array([x0, y0, z0]), np.array([sx, 0, 0]), np.array([0, 0, sz])),  # frente
        (np.array([x0, y1, z0]), np.array([sx, 0, 0]), np.array([0, 0, sz])),  # trás
        (np.array([x0, y0, z0]), np.array([0, sy, 0]), np.array([0, 0, sz])),  # esq
        (np.array([x1, y0, z0]), np.array([0, sy, 0]), np.array([0, 0, sz])),  # dir
    ]
    return np.concatenate([sample_plane(o, u, v, density, rng) for o, u, v in faces])


def build_room_cloud(density: float, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Nuvem completa da sala: piso + 4 paredes + objetos. → (pontos N×3, cores N×3)."""
    X, Y, Z = ROOM["x"], ROOM["y"], ROOM["z"]
    parts: list[tuple[np.ndarray, tuple[int, int, int]]] = [
        (
            sample_plane(np.zeros(3), np.array([X, 0, 0]), np.array([0, Y, 0]), density, rng),
            COLORS["floor"],
        ),
        (
            sample_plane(np.zeros(3), np.array([0, Y, 0]), np.array([0, 0, Z]), density, rng),
            COLORS["wall_x0"],
        ),
        (
            sample_plane(
                np.array([X, 0, 0]), np.array([0, Y, 0]), np.array([0, 0, Z]), density, rng
            ),
            COLORS["wall_x1"],
        ),
        (
            sample_plane(np.zeros(3), np.array([X, 0, 0]), np.array([0, 0, Z]), density, rng),
            COLORS["wall_y0"],
        ),
        (
            sample_plane(
                np.array([0, Y, 0]), np.array([X, 0, 0]), np.array([0, 0, Z]), density, rng
            ),
            COLORS["wall_y1"],
        ),
    ]
    for name, (center, size) in OBJECTS.items():
        parts.append((box_surface(center, size, density * 2.0, rng), COLORS[name]))

    points = np.concatenate([p for p, _ in parts]).astype(np.float32)
    colors = np.concatenate(
        [np.tile(np.array(c, dtype=np.uint8), (len(p), 1)) for p, c in parts]
    )
    return points, colors


def camera_trajectory(frames: int) -> list[np.ndarray]:
    """Trajetória circular dentro da sala, olhando para o centro. → lista de c2w 3×4."""
    cx, cy = ROOM["x"] / 2, ROOM["y"] / 2
    radius = min(ROOM["x"], ROOM["y"]) * 0.28
    height = 1.5  # altura de quem filma com celular
    target = np.array([cx, cy, 1.0])

    poses: list[np.ndarray] = []
    for i in range(frames):
        ang = 2 * np.pi * i / frames
        eye = np.array([cx + radius * np.cos(ang), cy + radius * np.sin(ang), height])

        # Convenção OpenCV: +Z da câmera aponta para a cena.
        forward = target - eye
        forward /= np.linalg.norm(forward)
        world_up = np.array([0.0, 0.0, 1.0])
        right = np.cross(forward, world_up)
        right /= np.linalg.norm(right)
        down = np.cross(forward, right)  # +Y da câmera aponta para baixo (OpenCV)

        c2w = np.eye(4)[:3, :]  # 3×4
        c2w[:, 0] = right
        c2w[:, 1] = down
        c2w[:, 2] = forward
        c2w[:, 3] = eye
        poses.append(c2w.astype(np.float32))
    return poses


def intrinsics() -> np.ndarray:
    """K fixa, FOV horizontal ~70° (típico de celular grande-angular moderado)."""
    fov_x = np.deg2rad(70.0)
    fx = IMG_W / (2 * np.tan(fov_x / 2))
    return np.array([[fx, 0, IMG_W / 2], [0, fx, IMG_H / 2], [0, 0, 1]], dtype=np.float32)


def render_frame(
    points: np.ndarray, colors: np.ndarray, c2w: np.ndarray, K: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Projeção com z-buffer por pixel — o "render" honesto da cena.

    Devolve (world_points H×W×3, depth H×W, image H×W×3 uint8, valid H×W bool),
    exatamente o que os NPZs do motor carregam por frame.
    """
    R = c2w[:, :3]  # camera→world
    t = c2w[:, 3]
    # world→camera: X_cam = Rᵀ (X_w − t)
    cam = (points - t) @ R
    z = cam[:, 2]
    in_front = z > 0.05

    uv = cam[in_front] @ K.T
    u = uv[:, 0] / uv[:, 2]
    v = uv[:, 1] / uv[:, 2]
    z_f = z[in_front]
    pts_f = points[in_front]
    col_f = colors[in_front]

    inside = (u >= 0) & (u < IMG_W) & (v >= 0) & (v < IMG_H)
    ui = u[inside].astype(np.int32)
    vi = v[inside].astype(np.int32)
    z_i = z_f[inside]
    pts_i = pts_f[inside]
    col_i = col_f[inside]

    depth = np.full((IMG_H, IMG_W), np.inf, dtype=np.float32)
    wp = np.zeros((IMG_H, IMG_W, 3), dtype=np.float32)
    img = np.zeros((IMG_H, IMG_W, 3), dtype=np.uint8)

    # Z-buffer: ordena de trás para frente; o mais próximo escreve por último.
    order = np.argsort(-z_i)
    depth[vi[order], ui[order]] = z_i[order]
    wp[vi[order], ui[order]] = pts_i[order]
    img[vi[order], ui[order]] = col_i[order]

    valid = np.isfinite(depth)
    depth[~valid] = 0.0
    return wp, depth, img, valid


# ---------------------------------------------------------------------------
# Escrita de artefatos
# ---------------------------------------------------------------------------


def write_ply(path: Path, points: np.ndarray, colors: np.ndarray) -> None:
    """PLY binário little-endian, XYZ float32 + RGB uint8 — o formato do PLYLoader."""
    n = len(points)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {n}\n"
        "property float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\n"
        "end_header\n"
    )
    # Registro empacotado: 3 floats + 3 bytes = 15 bytes por ponto.
    record = np.zeros(n, dtype=[("xyz", np.float32, 3), ("rgb", np.uint8, 3)])
    record["xyz"] = points.astype(np.float32)
    record["rgb"] = colors.astype(np.uint8)
    with path.open("wb") as f:
        f.write(header.encode("ascii"))
        f.write(record.tobytes())


def write_minimal_jpeg(path: Path, img: np.ndarray) -> None:
    """Grava a imagem como JPEG baseline via PNG→(sem lib) — na verdade, PNG.

    Honestidade sobre o atalho: encoder JPEG sem dependências não vale a complexidade
    para uma FIXTURE. Gravamos PNG com extensão .jpg — navegadores e o <img> do viewer
    decodificam por conteúdo, não por extensão. O worker REAL (D3) grava JPEG de
    verdade via OpenCV; o contrato de chaves (.jpg) fica idêntico.
    """
    h, w, _ = img.shape

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("fixtures"))
    parser.add_argument("--frames", type=int, default=48)
    parser.add_argument("--keyframe-every", type=int, default=4)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument(
        "--density", type=float, default=2600.0, help="pontos por unidade² de superfície"
    )
    args = parser.parse_args()

    out: Path = args.out
    npz_dir = out / "npz"
    kf_dir = out / "keyframes"
    for d in (out, npz_dir, kf_dir):
        d.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(args.seed)
    print(
        f"→ amostrando a sala {ROOM['x']}×{ROOM['y']}×{ROOM['z']} (densidade {args.density}/u²)"
    )
    points, colors = build_room_cloud(args.density, rng)
    print(f"  {len(points):,} pontos")

    K = intrinsics()
    poses = camera_trajectory(args.frames)

    print(f"→ renderizando {args.frames} frames ({IMG_W}×{IMG_H}) com z-buffer")
    keyframe_indices: list[int] = []
    poses_json: list[dict[str, object]] = []
    for i, c2w in enumerate(poses):
        wp, depth, img, valid = render_frame(points, colors, c2w, K)

        # Confiança: 2.0 nos pixels válidos, 0.0 no resto — acima/abaixo do filtro
        # de 1.5 usado pelo worker, para o filtro ser exercitado de verdade.
        conf = np.where(valid, 2.0, 0.0).astype(np.float32)

        np.savez_compressed(
            npz_dir / f"frame_{i:06d}.npz",
            world_points=wp,
            world_points_conf=conf,
            depth=depth[..., None],  # (H, W, 1) como o motor grava
            depth_conf=conf[..., None],
            extrinsic=c2w,  # 3×4 camera-to-world
            intrinsic=K,
            images=np.transpose(img, (2, 0, 1)),  # (3, H, W) como o motor grava
        )

        poses_json.append(
            {"i": i, "t_s": round(i / 8.0, 3), "c2w": c2w.tolist(), "K": K.tolist()}
        )
        if i % args.keyframe_every == 0:
            keyframe_indices.append(i)
            write_minimal_jpeg(kf_dir / f"{i}.jpg", img)

    # meta.npz global, como o motor grava junto dos frames.
    np.savez_compressed(
        npz_dir / "meta.npz",
        chunk_scales=np.ones(1, dtype=np.float32),
        chunk_transforms=np.eye(4, dtype=np.float32)[None, :3, :],
    )

    print("→ escrevendo artefatos prontos")
    write_ply(out / "cloud_preview.ply", points, colors)
    (out / "poses.json").write_text(
        json.dumps({"frames": poses_json, "keyframes": keyframe_indices})
    )

    # thumb: o primeiro keyframe
    first_kf = kf_dir / "0.jpg"
    if first_kf.exists():
        (out / "thumb.jpg").write_bytes(first_kf.read_bytes())

    ply_mb = (out / "cloud_preview.ply").stat().st_size / 1024 / 1024
    meta = {
        "synthetic": True,
        "room": ROOM,
        "objects": {k: {"center": v[0], "size": v[1]} for k, v in OBJECTS.items()},
        "frames": args.frames,
        "fps": 8,
        "resolution": [IMG_W, IMG_H],
        "keyframes": keyframe_indices,
        "points_raw": len(points),
        "points_preview": len(points),
        "cloud_preview_mb": round(ply_mb, 2),
        "infer_s": 0.0,
        "total_s": 0.0,
        "versions": {"fixture": "1.0", "seed": args.seed},
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2))

    print(
        f"✓ fixture em {out}/ — PLY de {ply_mb:.1f} MB, {args.frames} NPZs, {len(keyframe_indices)} keyframes"
    )
    if ply_mb > 35:
        raise SystemExit("✗ cloud_preview.ply passou de 35 MB — reduza a densidade (ADR-0006)")


if __name__ == "__main__":
    main()
