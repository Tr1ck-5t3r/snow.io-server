import { MOVE_SPEED } from "../config/constants";
import { PlayerState } from "./../rooms/schema/PlayerState";

export function applyMovement(
  player: PlayerState,
  input: any,
  delta: number
) {
  let dx = 0;
  let dz = 0;

  if (input.forward) dz -= 1;
  if (input.backward) dz += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;

  // normalize
  const length = Math.hypot(dx, dz);
  if (length > 0) {
    dx /= length;
    dz /= length;
  }

  const speed = MOVE_SPEED * delta;

  // rotate movement by yaw
  const sin = Math.sin(player.rotY);
  const cos = Math.cos(player.rotY);

  player.x += (dx * cos - dz * sin) * speed;
  player.z += (dx * sin + dz * cos) * speed;

  // Ensure x and z are not NaN
  player.x = isNaN(player.x) ? 0 : player.x;
  player.z = isNaN(player.z) ? 0 : player.z;
}
