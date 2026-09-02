import type { RoomDefinition } from "../types.js";

export const THE_VAULT_ROOM: RoomDefinition = {
  id: "the-vault",
  title: "The Vault",
  version: "1.0.0",
  difficulty: "starter",
  parActions: 7,
  introduction:
    "You are locked inside an old observatory. Find the three-digit vault code and open the vault door.",
  initialLocationId: "foyer",
  requiredSubmitLocationId: "vault",
  requiredSubmitFlag: "vault_unlocked",
  answer: "731",
  maxAttempts: 3,
  locations: {
    foyer: {
      id: "foyer",
      name: "Observatory Foyer",
      description:
        "Cold starlight falls across a stone tablet. A passage leads east.",
      exits: [
        {
          id: "to_gallery",
          label: "East passage",
          to: "gallery",
          description: "Walk east into the moon gallery."
        }
      ]
    },
    gallery: {
      id: "gallery",
      name: "Moon Gallery",
      description:
        "A brass key rests beneath a chart of silver moons. Passages lead west and north.",
      exits: [
        {
          id: "to_foyer",
          label: "West passage",
          to: "foyer",
          description: "Return west to the foyer."
        },
        {
          id: "to_vault",
          label: "North passage",
          to: "vault",
          description: "Walk north to the sealed vault."
        }
      ]
    },
    vault: {
      id: "vault",
      name: "Vault Antechamber",
      description:
        "A numbered vault door fills the north wall. The gallery lies south.",
      exits: [
        {
          id: "to_gallery",
          label: "South passage",
          to: "gallery",
          description: "Return south to the moon gallery."
        }
      ]
    }
  },
  items: {
    brass_key: {
      id: "brass_key",
      name: "Brass Key",
      description: "A small key engraved with a seven-pointed star."
    }
  },
  objects: {
    stone_tablet: {
      id: "stone_tablet",
      name: "Stone Tablet",
      description: "A weathered tablet covered in star symbols.",
      details:
        "One line remains readable: 'The star begins with seven.' The first digit is 7.",
      locationId: "foyer",
      interactionIds: []
    },
    moon_chart: {
      id: "moon_chart",
      name: "Moon Chart",
      description: "A chart showing rows of polished silver moons.",
      details:
        "There are thirty-one silver moons. A note says: 'Let the moons finish the code.' The final two digits are 31.",
      locationId: "gallery",
      interactionIds: []
    },
    brass_key: {
      id: "brass_key",
      name: "Brass Key",
      description: "A small key beneath the moon chart.",
      details: "The key is engraved with a seven-pointed star.",
      locationId: "gallery",
      interactionIds: ["take_brass_key"],
      hiddenWhenFlag: "brass_key_taken"
    },
    vault_door: {
      id: "vault_door",
      name: "Vault Door",
      description: "A locked door with a keyhole and a three-digit dial.",
      details:
        "The dial accepts three digits, but the locking mechanism must be opened with a key first.",
      locationId: "vault",
      interactionIds: ["unlock_vault"]
    }
  },
  interactions: {
    take_brass_key: {
      id: "take_brass_key",
      title: "Take the brass key",
      description: "Pick up the brass key and place it in your inventory.",
      targetId: "brass_key",
      locationId: "gallery",
      successMessage: "You take the brass key.",
      effect: {
        type: "take_item",
        itemId: "brass_key",
        takenFlag: "brass_key_taken"
      }
    },
    unlock_vault: {
      id: "unlock_vault",
      title: "Unlock the vault door",
      description: "Use the brass key on the vault door.",
      targetId: "vault_door",
      locationId: "vault",
      successMessage:
        "The brass key turns. The lock opens, leaving only the three-digit dial.",
      effect: {
        type: "set_flag",
        flag: "vault_unlocked",
        value: true,
        requiredItemId: "brass_key"
      }
    }
  }
};
