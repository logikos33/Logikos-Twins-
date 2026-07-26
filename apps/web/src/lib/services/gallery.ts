import { db } from "@/lib/db";
import * as storage from "@/lib/storage";

/**
 * Galeria de scans. Na D4 lista tudo (ambiente de desenvolvimento); a D7 coloca a
 * galeria completa atrás do ADMIN_TOKEN — o acesso individual continua por share_token.
 */

export type GalleryItem = {
  scanId: string;
  title: string | null;
  status: string;
  createdAt: string;
  shareToken: string;
  thumbUrl: string | null;
};

export async function listScans(limit = 50): Promise<GalleryItem[]> {
  const scans = await db.scan.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Promise.all(
    scans.map(async (s) => {
      const outputs = (s.outputs ?? {}) as Record<string, string>;
      const thumbKey = outputs["thumb_key"];
      return {
        scanId: s.id,
        title: s.title,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        shareToken: s.shareToken,
        thumbUrl: thumbKey ? await storage.presignGet(thumbKey, 3600) : null,
      };
    }),
  );
}
