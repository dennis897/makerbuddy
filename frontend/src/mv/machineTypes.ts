export interface MachineType {
  value: string;
  label: string;
  icon: string;
}

export const MACHINE_TYPES: MachineType[] = [
  { value: '3dprint', label: '3D Print', icon: '3D' },
  { value: 'cnc', label: 'CNC Router', icon: '🪵' },
];

export const machineIcon = (type: string): string =>
  MACHINE_TYPES.find((m) => m.value === type)?.icon ?? '📁';

export const isTextIcon = (icon: string): boolean => /^[A-Z0-9]+$/.test(icon);
