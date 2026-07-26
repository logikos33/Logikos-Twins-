# Protocolo de captura

Como filmar um ambiente para obter o melhor mapa 3D. A versão curta aparece na própria
página de gravação; esta é a referência completa.

## O essencial

| O quê | Como | Por quê |
|---|---|---|
| Orientação | **Celular na horizontal** | O motor infere a 518 px no lado maior; horizontal cobre mais cena por frame |
| Velocidade | **Um passo por segundo**, movimentos suaves | Blur de movimento destrói a correspondência entre frames |
| Percurso | **Feche voltas** — termine onde começou | O fechamento de loop é o que ancora as janelas do motor umas nas outras |
| Duração | 60–180 s (limite duro: 3 min) | Abaixo de 60 s falta paralaxe; acima de 3 min o custo cresce sem ganho para a demo |
| Iluminação | Boa e uniforme; evite contraluz | Sensor no escuro = ruído = pontos fantasma |
| Superfícies | Evite espelhos e vidro dominando a cena | Reflexo parece geometria e vira "parede" falsa |
| Giros | Lentos, nunca no próprio eixo parado | Rotação pura sem translação não gera paralaxe — o motor não tira profundidade disso |

## Roteiro sugerido para uma sala

1. Comece num canto, com boa visão do ambiente.
2. Ande devagar pelo perímetro, apontando levemente para o centro.
3. Ao passar por objetos de interesse (equipamentos, extintores, prateleiras),
   aproxime-se ~2 s sem parar de andar.
4. Feche a volta retornando ao ponto de partida, mirando a mesma vista do início.

## Escala real

Duas formas de dar escala métrica ao mapa:

- **Marcador ArUco impresso** (D6): imprima o PDF do marcador (A4, disponível na página
  de gravação), deixe-o plano no chão, visível por alguns segundos da filmagem. A escala
  é calculada sozinha.
- **Calibração manual** (D4): sem marcador, clique em dois pontos de distância conhecida
  no viewer (um batente de porta de 0,80 m, por exemplo) e informe o valor.

## Privacidade (LGPD)

- O vídeo bruto é **apagado automaticamente após 7 dias**; os artefatos 3D (nuvem de
  pontos, trajetória, keyframes) permanecem.
- O áudio é **descartado** — nunca é lido nem armazenado.
- Blur de rostos opcional por scan (D6).
- Evite filmar pessoas de perto quando não for esse o propósito do scan.

## Testar a captura no celular durante o desenvolvimento

`getUserMedia` exige **contexto seguro**. `http://localhost:3000` funciona no próprio
Mac, mas o celular acessando `http://192.168.x.x:3000` **não** — a câmera nem aparece.

Duas saídas:

```bash
# Opção A — mkcert (HTTPS local confiável)
brew install mkcert && mkcert -install
mkcert 192.168.x.x   # gera cert para o IP da máquina
# use um proxy HTTPS (ex.: caddy) apontando para :3000 com esse cert

# Opção B — túnel (mais simples, exige internet)
npx localtunnel --port 3000
# abra a URL https://... gerada no celular
```

> O túnel expõe a aplicação à internet enquanto estiver aberto. Use para teste rápido e
> feche — e nunca com dados que importem.

## Drone (N0)

Vídeo de drone entra pelo **fallback de arquivo** na página de gravação — mesmo pipeline,
sem mudança de código. Protocolo específico (altura, velocidade, padrão de voo) será
escrito quando o caminho for validado na F0 do plug-in.
