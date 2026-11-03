import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";
import { PlayerState } from "./schema/PlayerState";
import { ProjectileState } from "./schema/ProjectileState";
import { DecalState } from "./schema/DecalState";
import { applyMovement, startJump } from "../simulation/movement";
import { GRAVITY, PLAYER_RADIUS, WALL_HEIGHT, WORLD_DEPTH, WORLD_WIDTH } from "../config/constants";

const SNOWMAN_SCALE = 1.2;
const PLAYER_CAPSULE_RADIUS = 0.5 * SNOWMAN_SCALE;
const PROJECTILE_RADIUS = 0.22;
const HIT_RADIUS = PLAYER_CAPSULE_RADIUS + PROJECTILE_RADIUS;
const PLAYER_HEALTH = 50;
const SNOWBALL_DAMAGE = 25;
const RESPAWN_DELAY_MS = 5000;
const SPAWN_CORNERS: [number, number][] = [
  [-44, -44],
  [44, -44],
  [-44, 44],
  [44, 44],
];
const SPAWN_OFFSETS: [number, number][] = [
  [0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4],
  [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4],
];
const PROJECTILE_LIFETIME = 10000; // 10 seconds in ms
const DECAL_LIFETIME_MS = 5000;
const DECAL_FADE_DURATION_MS = 1500;
const PROJECTILE_SPAWN_GRACE_MS = 150;
// Keep server headroom below the client's fire interval so network jitter
// doesn't cause visually predicted shots to be rejected.
const SHOT_COOLDOWN_MS = 75;
const MAX_PROJECTILE_SPEED = 25;

export class MyRoom extends Room<MyRoomState> {
  maxClients = 4;
  private projectileCounter = 0;
  private decalCounter = 0;

  onCreate() {
    this.setState(new MyRoomState());

    this.onMessage("input", (client, input) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health <= 0) return;

      // interpret and sanitize directional input coming from the client
      player.inputForward = Number.isFinite(input?.forward) ? Math.max(-1, Math.min(1, input.forward)) : 0;
      player.inputRight = Number.isFinite(input?.right) ? Math.max(-1, Math.min(1, input.right)) : 0;
      player.rotationY = Number.isFinite(input?.rotY) ? input.rotY : player.rotationY;

      // console.log("Received input from", client.sessionId, {
      //   forward: player.inputForward,
      //   right: player.inputRight,
      //   rotY: player.rotationY,
      // });
      // console.log("Player state after input:", {
      //   x: player.x,
      //   z: player.z,
      // });
    });

    this.onMessage("jump", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player && player.health > 0) startJump(player);
    });

    this.onMessage("shoot", (client, data) => {
      const shooter = this.state.players.get(client.sessionId);
      if (!shooter || shooter.health <= 0) return;

      const now = Date.now();
      if (now - shooter.lastShotAt < SHOT_COOLDOWN_MS) {
        return;
      }

      const rawPosition = Array.isArray(data?.position) ? data.position : [0, 0, 0];
      const rawVelocity = Array.isArray(data?.velocity) ? data.velocity : [0, 0, 0];
      const position = rawPosition.map((value: number | string) => Number(value) || 0);
      const velocity = rawVelocity.map((value: number | string) => Number(value) || 0);

      if (position.length < 3 || velocity.length < 3) {
        return;
      }

      const launchSpeed = Math.hypot(velocity[0], velocity[1], velocity[2]);
      if (!Number.isFinite(launchSpeed) || launchSpeed <= 0 || launchSpeed > MAX_PROJECTILE_SPEED) {
        return;
      }

      const projectile = new ProjectileState();
      projectile.id = `projectile_${this.projectileCounter++}`;
      projectile.playerId = client.sessionId;
      projectile.x = position[0];
      projectile.y = position[1];
      projectile.z = position[2];
      projectile.vx = velocity[0];
      projectile.vy = velocity[1];
      projectile.vz = velocity[2];
      projectile.timestamp = now;

      shooter.lastShotAt = now;
      this.state.projectiles.set(projectile.id, projectile);
    });

    // schedule a simulation tick to apply movement and broadcast patches
    this.setSimulationInterval(this.update.bind(this), 1000 / 60);
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.name = typeof options.name === "string"
      ? options.name.trim().slice(0, 20) || "Snowman"
      : "Snowman";
    player.health = PLAYER_HEALTH;
    player.maxHealth = PLAYER_HEALTH;
    player.spawnIndex = this.findFreeSpawnIndex();
    this.placeAtSpawn(player);

    this.state.players.set(client.sessionId, player);
    console.log(client.sessionId, "joined");
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(client.sessionId, "left");
  }

  private simulateProjectiles(deltaTime: number) {
    const dt = deltaTime / 1000;
    const gravity = GRAVITY * dt;

    // Update projectile positions and check collisions
    const projectilesToRemove: string[] = [];

    for (const [projectileId, projectile] of this.state.projectiles.entries()) {
      const age = Date.now() - projectile.timestamp;
      if (age > PROJECTILE_LIFETIME) {
        projectilesToRemove.push(projectileId);
        continue;
      }

      // Keep a new projectile in replicated state long enough for clients to render it.
      if (age < PROJECTILE_SPAWN_GRACE_MS) continue;

      const previousPosition = { x: projectile.x, y: projectile.y, z: projectile.z };

      // Apply gravity
      projectile.vy -= gravity;

      // Update position
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.z += projectile.vz * dt;

      let impact: { x: number; y: number; z: number; nx: number; ny: number; nz: number } | null = null;

      // Arena floor
      if (projectile.y <= 0 && Math.abs(projectile.x) <= 50 && Math.abs(projectile.z) <= 50) {
        impact = { x: projectile.x, y: 0, z: projectile.z, nx: 0, ny: 1, nz: 0 };
      }

      // Arena walls (the visible walls sit on the +/-50 arena boundary)
      if (!impact && projectile.y <= WALL_HEIGHT && Math.abs(projectile.x) >= 50) {
        const side = Math.sign(projectile.x);
        impact = { x: side * 50, y: projectile.y, z: projectile.z, nx: -side, ny: 0, nz: 0 };
      }
      if (!impact && projectile.y <= WALL_HEIGHT && Math.abs(projectile.z) >= 50) {
        const side = Math.sign(projectile.z);
        impact = { x: projectile.x, y: projectile.y, z: side * 50, nx: 0, ny: 0, nz: -side };
      }

      // Check collision with players
      for (const [playerId, player] of this.state.players.entries()) {
        if (impact) break;
        if (playerId === projectile.playerId || player.health <= 0) continue;

        const playerHit = this.sweptSnowmanHit(previousPosition, projectile, player);
        if (!playerHit) continue;

        impact = playerHit;
        player.health = Math.max(0, player.health - SNOWBALL_DAMAGE);
        if (player.health === 0) {
          player.respawnAt = Date.now() + RESPAWN_DELAY_MS;
          player.inputForward = 0;
          player.inputRight = 0;
          player.velocityX = 0;
          player.velocityZ = 0;
          player.velocityY = 0;
        }
      }

      if (impact) {
        const decal = new DecalState();
        decal.id = `decal_${this.decalCounter++}`;
        decal.x = impact.x; decal.y = impact.y; decal.z = impact.z;
        decal.nx = impact.nx; decal.ny = impact.ny; decal.nz = impact.nz;
        const decalCreatedAt = Date.now();
        decal.createdAt = decalCreatedAt;
        decal.fadeAt = decalCreatedAt + DECAL_LIFETIME_MS - DECAL_FADE_DURATION_MS;
        decal.expiresAt = decalCreatedAt + DECAL_LIFETIME_MS;
        this.state.decals.set(decal.id, decal);
        if (this.state.decals.size > 200) {
          const oldestDecalId = this.state.decals.keys().next().value;
          if (oldestDecalId) this.state.decals.delete(oldestDecalId);
        }
        projectilesToRemove.push(projectileId);
        continue;
      }

      // Remove if below ground
      if (projectile.y < -10) {
        projectilesToRemove.push(projectileId);
      }
    }

    // Remove dead projectiles
    for (const projectileId of projectilesToRemove) {
      this.state.projectiles.delete(projectileId);
    }
  }

  update(deltaTime: number) {
    const dt = deltaTime / 1000;
    const now = Date.now();
    
    // Respawn due players, then move active players in small substeps. The
    // substeps prevent fast/lagged ticks from tunneling through another player.
    const activePlayers: PlayerState[] = [];
    for (const player of this.state.players.values()) {
      if (player.health <= 0) {
        if (now >= player.respawnAt) this.respawnPlayer(player);
        else continue;
      }
      activePlayers.push(player);
    }

    const substepCount = Math.max(1, Math.min(120, Math.ceil(dt / (1 / 60))));
    const substepDelta = dt / substepCount;
    for (let step = 0; step < substepCount; step += 1) {
      for (const player of activePlayers) {
        applyMovement(
          player,
          { forward: player.inputForward, right: player.inputRight, rotY: player.rotationY },
          substepDelta,
        );
      }
      this.resolveSnowmanCollisions();
    }

    // Simulate projectiles
    this.simulateProjectiles(deltaTime);
    this.expireDecals(now);
  }

  private expireDecals(now: number) {
    for (const [decalId, decal] of this.state.decals.entries()) {
      if (decal.expiresAt > 0 && now >= decal.expiresAt) {
        this.state.decals.delete(decalId);
      }
    }
  }

  private placeAtSpawn(player: PlayerState) {
    const [baseX, baseZ] = SPAWN_CORNERS[player.spawnIndex % SPAWN_CORNERS.length];
    let spawnX = baseX;
    let spawnZ = baseZ;
    const minDistance = PLAYER_RADIUS * 2 + 0.1;
    let greatestNearestDistance = -1;

    for (const [offsetX, offsetZ] of SPAWN_OFFSETS) {
      const candidateX = baseX + offsetX;
      const candidateZ = baseZ + offsetZ;
      const nearestDistance = Math.min(
        Number.POSITIVE_INFINITY,
        ...[...this.state.players.values()]
          .filter((other) => other !== player && other.health > 0)
          .map((other) => Math.hypot(candidateX - other.x, candidateZ - other.z)),
      );
      if (nearestDistance > greatestNearestDistance) {
        greatestNearestDistance = nearestDistance;
        spawnX = candidateX;
        spawnZ = candidateZ;
      }
      if (nearestDistance >= minDistance) {
        break;
      }
    }

    player.x = spawnX;
    player.y = 0;
    player.z = spawnZ;
    player.velocityX = 0;
    player.velocityY = 0;
    player.velocityZ = 0;
    player.inputForward = 0;
    player.inputRight = 0;
    player.isGrounded = true;
  }

  private findFreeSpawnIndex() {
    const occupied = new Set([...this.state.players.values()].map((player) => player.spawnIndex));
    const freeIndex = SPAWN_CORNERS.findIndex((_, index) => !occupied.has(index));
    return freeIndex >= 0 ? freeIndex : 0;
  }

  private resolveSnowmanCollisions() {
    const players = [...this.state.players.values()].filter((player) => player.health > 0);
    const minDistance = PLAYER_RADIUS * 2 + 0.1;
    const maxX = WORLD_WIDTH / 2 - PLAYER_RADIUS;
    const maxZ = WORLD_DEPTH / 2 - PLAYER_RADIUS;

    // A few passes handle crowded groups without allowing players to overlap.
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < players.length; i += 1) {
        for (let j = i + 1; j < players.length; j += 1) {
          const first = players[i];
          const second = players[j];
          let dx = second.x - first.x;
          let dz = second.z - first.z;
          let distance = Math.hypot(dx, dz);
          if (distance >= minDistance) continue;

          if (distance < 1e-6) {
            dx = first.sessionId < second.sessionId ? 1 : -1;
            dz = 0;
          }

          const normalLength = Math.hypot(dx, dz) || 1;
          const nx = dx / normalLength;
          const nz = dz / normalLength;
          const correction = (minDistance - distance) / 2;
          first.x = Math.max(-maxX, Math.min(maxX, first.x - nx * correction));
          first.z = Math.max(-maxZ, Math.min(maxZ, first.z - nz * correction));
          second.x = Math.max(-maxX, Math.min(maxX, second.x + nx * correction));
          second.z = Math.max(-maxZ, Math.min(maxZ, second.z + nz * correction));

          // Remove closing velocity along the contact normal. Tangential
          // movement remains intact, while pushing directly into a Snowman
          // can't build up enough motion to pass through it.
          const closingVelocity = (second.velocityX - first.velocityX) * nx
            + (second.velocityZ - first.velocityZ) * nz;
          if (closingVelocity < 0) {
            const impulse = closingVelocity * 0.5;
            first.velocityX += nx * impulse;
            first.velocityZ += nz * impulse;
            second.velocityX -= nx * impulse;
            second.velocityZ -= nz * impulse;
          }
        }
      }
    }
  }

  private respawnPlayer(player: PlayerState) {
    // Move the player to a different corner than the one used before death.
    player.spawnIndex = (player.spawnIndex + 1) % SPAWN_CORNERS.length;
    this.placeAtSpawn(player);
    player.health = player.maxHealth;
    player.respawnAt = 0;
  }

  private sweptSnowmanHit(
    from: { x: number; y: number; z: number },
    projectile: ProjectileState,
    player: PlayerState,
  ) {
    const dx = projectile.x - from.x;
    const dy = projectile.y - from.y;
    const dz = projectile.z - from.z;
    const horizontalLengthSq = dx * dx + dz * dz;
    const segmentLengthSq = horizontalLengthSq + dy * dy;
    const bottom = player.y + 0.5 * SNOWMAN_SCALE;
    const top = player.y + 1.6 * SNOWMAN_SCALE;
    const candidates = [0, 1];

    if (horizontalLengthSq > 0) {
      candidates.push(Math.max(0, Math.min(1,
        ((player.x - from.x) * dx + (player.z - from.z) * dz) / horizontalLengthSq,
      )));
    }
    if (Math.abs(dy) > 1e-8) {
      candidates.push(Math.max(0, Math.min(1, (bottom - from.y) / dy)));
      candidates.push(Math.max(0, Math.min(1, (top - from.y) / dy)));
    }
    if (segmentLengthSq > 0) {
      for (const endpointY of [bottom, top]) {
        const projection = ((player.x - from.x) * dx
          + (endpointY - from.y) * dy
          + (player.z - from.z) * dz) / segmentLengthSq;
        candidates.push(Math.max(0, Math.min(1, projection)));
      }
    }

    let closest = { x: from.x, y: from.y, z: from.z };
    let closestAxis = { x: player.x, y: bottom, z: player.z };
    let closestDistanceSq = Number.POSITIVE_INFINITY;

    for (const t of candidates) {
      const point = { x: from.x + dx * t, y: from.y + dy * t, z: from.z + dz * t };
      const axis = { x: player.x, y: Math.max(bottom, Math.min(top, point.y)), z: player.z };
      const ox = point.x - axis.x;
      const oy = point.y - axis.y;
      const oz = point.z - axis.z;
      const distanceSq = ox * ox + oy * oy + oz * oz;
      if (distanceSq < closestDistanceSq) {
        closestDistanceSq = distanceSq;
        closest = point;
        closestAxis = axis;
      }
    }

    if (closestDistanceSq > HIT_RADIUS * HIT_RADIUS) return null;

    let nx = closest.x - closestAxis.x;
    let ny = closest.y - closestAxis.y;
    let nz = closest.z - closestAxis.z;
    let normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (normalLength < 1e-8) {
      // A dead-center hit has no radial direction; use the incoming shot
      // direction so its impact decal still has a valid surface normal.
      nx = -dx;
      ny = -dy;
      nz = -dz;
      normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    }
    nx /= normalLength;
    ny /= normalLength;
    nz /= normalLength;

    return {
      x: closestAxis.x + nx * PLAYER_CAPSULE_RADIUS,
      y: closestAxis.y + ny * PLAYER_CAPSULE_RADIUS,
      z: closestAxis.z + nz * PLAYER_CAPSULE_RADIUS,
      nx,
      ny,
      nz,
    };
  }
}
