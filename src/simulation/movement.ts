import { GRAVITY, MOVE_ACCELERATION, MOVE_FRICTION, MOVE_SPEED, PLAYER_JUMP_HEIGHT, PLAYER_RADIUS, WORLD_DEPTH, WORLD_WIDTH } from "../config/constants";
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

  const maxX = WORLD_WIDTH / 2 - PLAYER_RADIUS;
  const maxZ = WORLD_DEPTH / 2 - PLAYER_RADIUS;
  player.x = Number.isFinite(player.x) ? Math.max(-maxX, Math.min(maxX, player.x)) : 0;
  player.z = Number.isFinite(player.z) ? Math.max(-maxZ, Math.min(maxZ, player.z)) : 0;

  // Clear velocity directed out of the arena so the player does not press against an edge.
  if ((player.x === maxX && nextVX > 0) || (player.x === -maxX && nextVX < 0)) player.velocityX = 0;
  if ((player.z === maxZ && nextVZ > 0) || (player.z === -maxZ && nextVZ < 0)) player.velocityZ = 0;

  applyVerticalMovement(player, delta);
}

export function startJump(player: PlayerState) {
  if (!player.isGrounded) return false;

  player.velocityY = Math.sqrt(2 * GRAVITY * PLAYER_JUMP_HEIGHT);
  player.isGrounded = false;
  return true;
}

function applyVerticalMovement(player: PlayerState, delta: number) {
  if (player.isGrounded) {
    player.y = 0;
    player.velocityY = 0;
    return;
  }

  player.velocityY -= GRAVITY * delta;
  player.y += player.velocityY * delta;

  if (player.y <= 0) {
    player.y = 0;
    player.velocityY = 0;
    player.isGrounded = true;
  }
}
