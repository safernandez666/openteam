export interface DesktopConfig {
  port: number;
  host: string;
  width: number;
  height: number;
}

export const DEFAULT_CONFIG: DesktopConfig = {
  port: 4200,
  host: "127.0.0.1",
  width: 1400,
  height: 900,
};
