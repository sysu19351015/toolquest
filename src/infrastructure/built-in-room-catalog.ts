import type { RoomCatalog } from "../application/ports.js";
import { THE_VAULT_ROOM } from "../domain/rooms/the-vault.js";
import type { RoomDefinition } from "../domain/types.js";

export class BuiltInRoomCatalog implements RoomCatalog {
  private readonly rooms = new Map<string, RoomDefinition>([
    [THE_VAULT_ROOM.id, THE_VAULT_ROOM]
  ]);

  public find(roomId: string): RoomDefinition | undefined {
    return this.rooms.get(roomId);
  }

  public list(): Array<Pick<RoomDefinition, "id" | "title" | "version">> {
    return [...this.rooms.values()].map(({ id, title, version }) => ({
      id,
      title,
      version
    }));
  }
}
