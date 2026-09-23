import type { Vec3 } from '@core';

/** A thing the player can look at and use. Mirrors `InteractableSpec` at runtime. */
export interface Interactable {
  readonly id: string;
  readonly kind: 'door' | 'pickup' | 'exit';
  position: Vec3;
  label: string;
  lockedLabel: string;
  /** Pickup id needed to use it, or '' for none. */
  requires: string;
  /** Doors and exits start closed; pickups start un-taken. */
  used: boolean;
  /** Index into the level's collider list, or -1 when it blocks nothing. */
  colliderIndex: number;
}
