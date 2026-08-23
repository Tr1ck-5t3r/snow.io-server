import { MOVE_ACCELERATION, MOVE_FRICTION, MOVE_SPEED } from "../config/constants";
import { PlayerState } from "./../rooms/schema/PlayerState";

export function applyMovement(
  player: PlayerState,
  input: { forward?: number; right?: number; rotY?: number },
  delta: number
) {
  const forwardInput = input.forward ?? 0;
  const rightInput = input.right ?? 0;
  const yaw = input.rotY ?? player.rotationY;

  // Derive world forward and right vectors from camera yaw angle
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  const desiredX = forwardX * forwardInput + rightX * rightInput;
  const desiredZ = forwardZ * forwardInput + rightZ * rightInput;

  const desiredLength = Math.hypot(desiredX, desiredZ);

  let targetVX = 0;
  let targetVZ = 0;

  if (desiredLength > 0) {
    targetVX = (desiredX / desiredLength) * MOVE_SPEED;
    targetVZ = (desiredZ / desiredLength) * MOVE_SPEED;
  }

  const currentVX = player.velocityX ?? 0;
  const currentVZ = player.velocityZ ?? 0;

  let nextVX = currentVX;
  let nextVZ = currentVZ;

  if (desiredLength > 0) {
    const deltaVX = targetVX - currentVX;
    const deltaVZ = targetVZ - currentVZ;
    const maxStepX = MOVE_ACCELERATION * delta;
    const maxStepZ = MOVE_ACCELERATION * delta;

    nextVX = currentVX + Math.max(-maxStepX, Math.min(maxStepX, deltaVX));
    nextVZ = currentVZ + Math.max(-maxStepZ, Math.min(maxStepZ, deltaVZ));
  } else {
    const frictionStep = MOVE_FRICTION * delta;

    if (Math.abs(currentVX) > 0.001) {
      nextVX = currentVX - Math.sign(currentVX) * Math.min(Math.abs(currentVX), frictionStep);
    } else {
      nextVX = 0;
    }

    if (Math.abs(currentVZ) > 0.001) {
      nextVZ = currentVZ - Math.sign(currentVZ) * Math.min(Math.abs(currentVZ), frictionStep);
    } else {
      nextVZ = 0;
    }
  }

  const velocityLength = Math.hypot(nextVX, nextVZ);
  if (velocityLength > MOVE_SPEED) {
    const scale = MOVE_SPEED / velocityLength;
    nextVX *= scale;
    nextVZ *= scale;
  }

  player.velocityX = nextVX;
  player.velocityZ = nextVZ;

  player.x += nextVX * delta;
  player.z += nextVZ * delta;

  player.x = isNaN(player.x) ? 0 : player.x;
  player.z = isNaN(player.z) ? 0 : player.z;
}
