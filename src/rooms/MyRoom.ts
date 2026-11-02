import { Room, Client } from "@colyseus/core";
import { MyRoomState } from "./schema/MyRoomState";
import { PlayerState } from "./schema/PlayerState";
import { ProjectileState } from "./schema/ProjectileState";
import { DecalState } from "./schema/DecalState";
import { applyMovement, startJump } from "../simulation/movement";
import { GRAVITY, WALL_HEIGHT } from "../config/constants";

const COLLISION_RADIUS = 1.5;
const PROJECTILE_LIFETIME = 10000; // 10 seconds in ms
const PROJECTILE_SPAWN_GRACE_MS = 150;
const SHOT_COOLDOWN_MS = 250;
const MAX_PROJECTILE_SPEED = 80;

export class MyRoom extends Room<MyRoomState> {
  maxClients = 4;
  private projectileCounter = 0;
  private decalCounter = 0;

  onCreate() {
    this.setState(new MyRoomState());

    this.onMessage("input", (client, input) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

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
      if (player) startJump(player);
    });

    this.onMessage("shoot", (client, data) => {
      const shooter = this.state.players.get(client.sessionId);
      if (!shooter) return;

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

  onJoin(client: Client) {
    const player = new PlayerState();
    player.sessionId = client.sessionId;

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
        if (playerId === projectile.playerId) continue; // Don't hit the shooter

        const dx = projectile.x - player.x;
        const dy = projectile.y - player.y;
        const dz = projectile.z - player.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < COLLISION_RADIUS) {
          console.log("Projectile", projectileId, "hit player", playerId);
          const length = distance || 1;
          const nx = dx / length;
          const ny = dy / length;
          const nz = dz / length;
          impact = {
            x: player.x + nx * COLLISION_RADIUS,
            y: player.y + ny * COLLISION_RADIUS,
            z: player.z + nz * COLLISION_RADIUS,
            nx, ny, nz,
          };
          break;
        }
      }

      if (impact) {
        const decal = new DecalState();
        decal.id = `decal_${this.decalCounter++}`;
        decal.x = impact.x; decal.y = impact.y; decal.z = impact.z;
        decal.nx = impact.nx; decal.ny = impact.ny; decal.nz = impact.nz;
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
    
    // Simulate player movement
    for (const player of this.state.players.values()) {
      const prevX = player.x;
      const prevZ = player.z;

      // apply movement based on stored input values
      applyMovement(
        player,
        { forward: player.inputForward, right: player.inputRight, rotY: player.rotationY },
        dt
      );

      if (player.x !== prevX || player.z !== prevZ) {
        //console.log("Player moved", player.sessionId, player.x.toFixed(2), player.z.toFixed(2));
      }
    }

    // Simulate projectiles
    this.simulateProjectiles(deltaTime);
  }
}
