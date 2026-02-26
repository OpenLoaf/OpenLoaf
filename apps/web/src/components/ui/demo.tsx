/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { MessageDock, type Character } from "@/components/ui/message-dock";

const customCharacters: Character[] = [
  {
    emoji: "✨",
    name: "Sparkle",
    online: false,
    avatar:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=80&q=80",
  },
  {
    emoji: "🧙‍♂️",
    name: "Wizard",
    online: true,
    backgroundColor: "bg-green-300",
    gradientColors: "#86efac, #dcfce7",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=80",
  },
  {
    emoji: "🦄",
    name: "Unicorn",
    online: true,
    backgroundColor: "bg-purple-300",
    gradientColors: "#c084fc, #f3e8ff",
    avatar:
      "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=80&q=80",
  },
  {
    emoji: "🐵",
    name: "Monkey",
    online: true,
    backgroundColor: "bg-yellow-300",
    gradientColors: "#fde047, #fefce8",
    avatar:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=80&q=80",
  },
  {
    emoji: "🤖",
    name: "Robot",
    online: false,
    backgroundColor: "bg-red-300",
    gradientColors: "#fca5a5, #fef2f2",
    avatar:
      "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=80&q=80",
  },
];

export default function Demo() {
  /** Handle dock message sends. */
  const handleMessageSend = (
    message: string,
    character: Character,
    index: number
  ) => {
    console.log("Message sent:", { message, character: character.name, index });
  };

  /** Handle character selection. */
  const handleCharacterSelect = (character: Character) => {
    console.log("Character selected:", character.name);
  };

  /** Handle dock expand/collapse. */
  const handleDockToggle = (isExpanded: boolean) => {
    console.log("Dock expanded:", isExpanded);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <MessageDock
        characters={customCharacters}
        onMessageSend={handleMessageSend}
        onCharacterSelect={handleCharacterSelect}
        onDockToggle={handleDockToggle}
        expandedWidth={500}
        placeholder={(name) => `Send a message to ${name}...`}
        theme="light"
        enableAnimations
        closeOnSend
        autoFocus
      />
    </div>
  );
}
