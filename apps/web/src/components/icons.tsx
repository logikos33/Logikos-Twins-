/**
 * Ícones do produto — traço uniforme 1.6–1.8, cantos retos, grid 24 (manual §8:
 * "ícones seguem o mesmo desenho do símbolo"). Sempre currentColor.
 */

type P = { className?: string };

function I({ className, children }: P & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} aria-hidden="true">
      {children}
    </svg>
  );
}
const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const IconX = (p: P) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6L6 18" {...s} />
  </I>
);
export const IconBack = (p: P) => (
  <I {...p}>
    <path d="M15 6l-6 6 6 6" {...s} />
  </I>
);
export const IconChev = (p: P) => (
  <I {...p}>
    <path d="M9 6l6 6-6 6" {...s} />
  </I>
);
export const IconHelp = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" {...s} />
    <path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 3.05c-.7.34-1 .75-1 1.55" {...s} />
    <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
  </I>
);
export const IconPhoneH = (p: P) => (
  <I {...p}>
    <rect x="3" y="7" width="18" height="10" rx="2.4" {...s} />
    <circle cx="17.6" cy="12" r="0.9" fill="currentColor" stroke="none" />
  </I>
);
export const IconSteps = (p: P) => (
  <I {...p}>
    <path d="M5 17h4v-4h4V9h4V5M5 21h14" {...s} />
  </I>
);
export const IconLoop = (p: P) => (
  <I {...p}>
    <path d="M12 4a8 8 0 1 1-7.4 5M4 4v5h5" {...s} />
  </I>
);
export const IconClock = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.5" {...s} />
    <path d="M12 7.5V12l3 2" {...s} />
  </I>
);
export const IconPrint = (p: P) => (
  <I {...p}>
    <path d="M7 8V4h10v4M7 17H4v-6a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 11v6h-3" {...s} />
    <rect x="7" y="14.5" width="10" height="6" rx="1" {...s} />
  </I>
);
export const IconShield = (p: P) => (
  <I {...p}>
    <path d="M12 3l7 2.6v5.2c0 4.6-3 8.2-7 10.2-4-2-7-5.6-7-10.2V5.6L12 3z" {...s} strokeWidth={1.6} />
  </I>
);
export const IconCamOff = (p: P) => (
  <I {...p}>
    <path d="M4 4l16 16" {...s} />
    <path
      d="M9.5 6H14a2 2 0 0 1 2 2v1l4-2.4v10.2M16 16.2A2 2 0 0 1 14 18H5a2 2 0 0 1-2-2V8a2 2 0 0 1 1.6-1.96"
      {...s}
    />
  </I>
);
export const IconUpFile = (p: P) => (
  <I {...p}>
    <path d="M12 16V6m0 0l-4 4m4-4l4 4M4 19h16" {...s} />
  </I>
);
export const IconFile = (p: P) => (
  <I {...p}>
    <path d="M6 3h8l4 4v14H6zM14 3v4h4" {...s} strokeWidth={1.7} />
  </I>
);
export const IconLock = (p: P) => (
  <I {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" {...s} strokeWidth={1.7} />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...s} strokeWidth={1.7} />
    <circle cx="12" cy="15.2" r="1.2" fill="currentColor" stroke="none" />
  </I>
);
export const IconKey = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="9" r="4.2" {...s} />
    <path d="M10 12.6L8.6 20h6.8L14 12.6" {...s} />
  </I>
);
export const IconSearch = (p: P) => (
  <I {...p}>
    <circle cx="11" cy="11" r="6.5" {...s} />
    <path d="M16 16l4.5 4.5" {...s} />
  </I>
);
export const IconOrbit = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3.2" {...s} strokeWidth={1.7} />
    <ellipse
      cx="12"
      cy="12"
      rx="9.5"
      ry="4.2"
      transform="rotate(-18 12 12)"
      {...s}
      strokeWidth={1.4}
    />
  </I>
);
export const IconRuler = (p: P) => (
  <I {...p}>
    <rect x="2.8" y="9" width="18.4" height="6" rx="1.4" transform="rotate(-35 12 12)" {...s} strokeWidth={1.6} />
    <path d="M9.4 13.4l1 1.5M12 11.5l1 1.5M14.6 9.7l1 1.5" {...s} strokeWidth={1.4} />
  </I>
);
export const IconPin = (p: P) => (
  <I {...p}>
    <path d="M12 21s-6.5-6.2-6.5-10.6a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" {...s} strokeWidth={1.7} />
    <circle cx="12" cy="10.3" r="2.1" {...s} strokeWidth={1.6} />
  </I>
);
export const IconLayers = (p: P) => (
  <I {...p}>
    <path d="M12 3.5l9 4.7-9 4.7-9-4.7 9-4.7z" {...s} strokeWidth={1.6} />
    <path d="M3.5 12.6l8.5 4.4 8.5-4.4M3.5 16.6L12 21l8.5-4.4" {...s} strokeWidth={1.6} />
  </I>
);
export const IconPlay = (p: P) => (
  <I {...p}>
    <path d="M8 5.5v13l11-6.5L8 5.5z" fill="currentColor" stroke="none" />
  </I>
);
export const IconCut = (p: P) => (
  <I {...p}>
    <path d="M4 8h16M4 16h16" {...s} strokeWidth={1.7} />
    <path d="M9 12h6" {...s} strokeWidth={1.7} strokeDasharray="2 3" />
  </I>
);
export const IconFly = (p: P) => (
  <I {...p}>
    <path d="M3 12l18-7-7 18-2.5-7.5L3 12z" {...s} strokeWidth={1.7} />
  </I>
);
export const IconPlan = (p: P) => (
  <I {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" {...s} strokeWidth={1.7} />
    <path d="M4 10h8v10M12 10V4M12 14h8" {...s} strokeWidth={1.5} />
  </I>
);
export const IconCube = (p: P) => (
  <I {...p}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" {...s} strokeWidth={1.6} />
    <path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" {...s} strokeWidth={1.4} />
  </I>
);
export const IconShare = (p: P) => (
  <I {...p}>
    <circle cx="6" cy="12" r="2.4" {...s} strokeWidth={1.7} />
    <circle cx="17.5" cy="5.5" r="2.4" {...s} strokeWidth={1.7} />
    <circle cx="17.5" cy="18.5" r="2.4" {...s} strokeWidth={1.7} />
    <path d="M8.2 10.8l7-4M8.2 13.2l7 4" {...s} strokeWidth={1.7} />
  </I>
);
export const IconEye = (p: P) => (
  <I {...p}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" {...s} strokeWidth={1.7} />
    <circle cx="12" cy="12" r="2.6" {...s} strokeWidth={1.7} />
  </I>
);
export const IconEyeOff = (p: P) => (
  <I {...p}>
    <path
      d="M4 4l16 16M9.9 6.3A9.9 9.9 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-3.2 3.9M6 8a16 16 0 0 0-3.5 4S6 18.2 12 18.2c1 0 2-.2 2.9-.5"
      {...s}
      strokeWidth={1.7}
    />
  </I>
);
export const IconAlert = (p: P) => (
  <I {...p}>
    <path d="M12 3l10 17H2L12 3z" {...s} strokeWidth={1.7} />
    <path d="M12 10v4.5" {...s} />
    <circle cx="12" cy="17.3" r="1" fill="currentColor" stroke="none" />
  </I>
);
export const IconRoute = (p: P) => (
  <I {...p}>
    <circle cx="6" cy="18" r="2.2" {...s} strokeWidth={1.6} />
    <circle cx="18" cy="6" r="2.2" {...s} strokeWidth={1.6} />
    <path d="M8 17h6a3.5 3.5 0 0 0 0-7H9.5a3.5 3.5 0 0 1 0-7H16" {...s} strokeWidth={1.6} strokeDasharray="3 3" />
  </I>
);
export const IconMail = (p: P) => (
  <I {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" {...s} strokeWidth={1.7} />
    <path d="M4 7.5l8 6 8-6" {...s} strokeWidth={1.7} />
  </I>
);
