import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (props: IconProps) => (
  <Base {...props}>
    <path d="M3.5 10.5 12 4l8.5 6.5" />
    <path d="M5.5 9.8V19a1 1 0 0 0 1 1H10v-5h4v5h3.5a1 1 0 0 0 1-1V9.8" />
  </Base>
);

export const IconMarket = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </Base>
);

export const IconCalendar = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Base>
);

export const IconCompetitors = (props: IconProps) => (
  <Base {...props}>
    <path d="M9 7a3 3 0 1 0 0-.001" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M17 11a2.5 2.5 0 1 0 0-.001" />
    <path d="M15.5 20a5 5 0 0 1 5.5-4.9" />
  </Base>
);

export const IconInsight = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6l.1.5h5l.1-.5c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z" />
    <path d="M10 20h4M10.5 18h3" />
  </Base>
);

export const IconData = (props: IconProps) => (
  <Base {...props}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
    <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
  </Base>
);

export const IconMoney = (props: IconProps) => (
  <Base {...props}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </Base>
);

export const IconBed = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 18v-8M3 13h18a0 0 0 0 1 0 0v5" />
    <path d="M21 18v-3" />
    <path d="M7 13v-2a1 1 0 0 1 1-1h9a2 2 0 0 1 2 2v1" />
    <circle cx="7.5" cy="10.5" r="1.5" />
  </Base>
);

export const IconTrend = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 16.5 9 10l4 4 7.5-7.5" />
    <path d="M15 6.5h5.5V12" />
  </Base>
);

export const IconStar = (props: IconProps) => (
  <Base {...props}>
    <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8Z" />
  </Base>
);

export const IconPercent = (props: IconProps) => (
  <Base {...props}>
    <path d="M19 5 5 19" />
    <circle cx="7.5" cy="7.5" r="2.5" />
    <circle cx="16.5" cy="16.5" r="2.5" />
  </Base>
);

export const IconMenu = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const IconClose = (props: IconProps) => (
  <Base {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const IconInfo = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Base>
);

export const IconArrowUp = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 19V6M6 11.5 12 5.5l6 6" />
  </Base>
);

export const IconArrowDown = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v13M6 12.5l6 6 6-6" />
  </Base>
);

export const IconGuests = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Base>
);

export const IconNights = (props: IconProps) => (
  <Base {...props}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Base>
);
