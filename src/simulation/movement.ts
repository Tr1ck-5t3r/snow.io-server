import { MOVE_SPEED } from "../config/constants";
import { PlayerState } from "./../rooms/schema/PlayerState";

export function applyMovement(
  player: PlayerState,
  input: { forward?: number; right?: number; rotY?: number },
  delta: number
) {
  // derive movement axes from input (forward should move toward negative z, matching previous logic)
  let dx = input.right || 0;
  let dz = -(input.forward || 0);

  // normalize the vector so diagonal movement isn't faster
  const length = Math.hypot(dx, dz);
  if (length > 0) {
    dx /= length;
    dz /= length;
  } else {
    dx = 0;
    dz = 0;
  }

  const speed = MOVE_SPEED * delta;

  // rotate movement by yaw; prefer the yaw that came with input (e.g. fresh camera angles)
  const yaw = input.rotY !== undefined ? input.rotY : player.rotationY;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  player.x += (dx * cos - dz * sin) * speed;
  player.z += (dx * sin + dz * cos) * speed;

  // Ensure x and z are not NaN
  player.x = isNaN(player.x) ? 0 : player.x;
  player.z = isNaN(player.z) ? 0 : player.z;
}
