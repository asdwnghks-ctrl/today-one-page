export type MemberColor = {
  colorKey: string;
  accentColor: string;
  accentDeep: string;
  accentSoft: string;
};

export const MEMBER_COLOR_PALETTE: MemberColor[] = [
  { colorKey: "olive", accentColor: "#5F6F3E", accentDeep: "#48552F", accentSoft: "#E8E5D4" },
  { colorKey: "pink", accentColor: "#A93F62", accentDeep: "#8F2F50", accentSoft: "#FCE4EC" },
  { colorKey: "indigo", accentColor: "#4C5C9E", accentDeep: "#38427A", accentSoft: "#E3E6F5" },
  { colorKey: "teal", accentColor: "#3E8E82", accentDeep: "#2E6B62", accentSoft: "#DCEFEA" },
  { colorKey: "amber", accentColor: "#B0752E", accentDeep: "#8C5A20", accentSoft: "#F5E9D6" },
  { colorKey: "plum", accentColor: "#7A4B8C", accentDeep: "#5E3A6C", accentSoft: "#EFE1F2" },
];

export function colorForKey(colorKey: string): MemberColor {
  return MEMBER_COLOR_PALETTE.find((color) => color.colorKey === colorKey) ?? MEMBER_COLOR_PALETTE[0];
}

export function isValidColorKey(colorKey: string): boolean {
  return MEMBER_COLOR_PALETTE.some((color) => color.colorKey === colorKey);
}
