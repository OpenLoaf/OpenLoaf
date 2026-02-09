"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Character {
  id?: string | number;
  emoji: string;
  name: string;
  online: boolean;
  backgroundColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
  gradientColors?: string;
  avatar?: string;
}

export interface MessageDockProps {
  /** Character data. */
  characters?: Character[];
  /** Fires when a message is sent. */
  onMessageSend?: (
    message: string,
    character: Character,
    characterIndex: number
  ) => void;
  /** Fires when a character is selected. */
  onCharacterSelect?: (character: Character, characterIndex: number) => void;
  /** Fires when dock expands or collapses. */
  onDockToggle?: (isExpanded: boolean) => void;
  /** Root className override. */
  className?: string;
  /** Expanded width in pixels. */
  expandedWidth?: number;
  /** Dock position. */
  position?: "bottom" | "top";
  /** Toggle sparkle button visibility. */
  showSparkleButton?: boolean;
  /** Toggle menu button visibility. */
  showMenuButton?: boolean;
  /** Enable motion animations. */
  enableAnimations?: boolean;
  /** Global animation duration scale. */
  animationDuration?: number;
  /** Input placeholder factory. */
  placeholder?: (characterName: string) => string;
  /** Theme mode. */
  theme?: "light" | "dark" | "auto";
  /** Auto focus the input on expand. */
  autoFocus?: boolean;
  /** Close on click outside. */
  closeOnClickOutside?: boolean;
  /** Close on escape key press. */
  closeOnEscape?: boolean;
  /** Close after sending a message. */
  closeOnSend?: boolean;
}

const defaultCharacters: Character[] = [
  { emoji: "✨", name: "Sparkle", online: false },
  {
    emoji: "🧙‍♂️",
    name: "Wizard",
    online: true,
    backgroundColor: "bg-green-300",
    gradientFrom: "from-green-300",
    gradientTo: "to-green-100",
    gradientColors: "#86efac, #dcfce7",
  },
  {
    emoji: "🦄",
    name: "Unicorn",
    online: true,
    backgroundColor: "bg-purple-300",
    gradientFrom: "from-purple-300",
    gradientTo: "to-purple-100",
    gradientColors: "#c084fc, #f3e8ff",
  },
  {
    emoji: "🐵",
    name: "Monkey",
    online: true,
    backgroundColor: "bg-yellow-300",
    gradientFrom: "from-yellow-300",
    gradientTo: "to-yellow-100",
    gradientColors: "#fde047, #fefce8",
  },
  {
    emoji: "🤖",
    name: "Robot",
    online: false,
    backgroundColor: "bg-red-300",
    gradientFrom: "from-red-300",
    gradientTo: "to-red-100",
    gradientColors: "#fca5a5, #fef2f2",
  },
];

/** Resolve gradient colors for the selected character. */
const getGradientColors = (character: Character) =>
  character.gradientColors || "#86efac, #dcfce7";

export function MessageDock({
  characters = defaultCharacters,
  onMessageSend,
  onCharacterSelect,
  onDockToggle,
  className,
  expandedWidth = 448,
  position = "bottom",
  showSparkleButton = true,
  showMenuButton = true,
  enableAnimations = true,
  animationDuration = 1,
  placeholder = (name: string) => `Message ${name}...`,
  theme = "light",
  autoFocus = true,
  closeOnClickOutside = true,
  closeOnEscape = true,
  closeOnSend = true,
}: MessageDockProps) {
  const shouldReduceMotion = useReducedMotion();
  const [expandedCharacter, setExpandedCharacter] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const dockRef = useRef<HTMLDivElement>(null);
  const [collapsedWidth, setCollapsedWidth] = useState<number>(266);
  const [hasInitialized, setHasInitialized] = useState(false);

  // 中文注释：仅首次挂载时测量折叠宽度，避免动画抖动。
  useEffect(() => {
    if (dockRef.current && !hasInitialized) {
      const width = dockRef.current.offsetWidth;
      if (width > 0) {
        setCollapsedWidth(width);
        setHasInitialized(true);
      }
    }
  }, [hasInitialized]);

  // 中文注释：点击外部区域时收起 dock。
  useEffect(() => {
    if (!closeOnClickOutside) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setExpandedCharacter(null);
        setMessageInput("");
        onDockToggle?.(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [closeOnClickOutside, onDockToggle]);

  const containerVariants = {
    hidden: {
      opacity: 0,
      y: 100,
      scale: 0.8,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const hoverAnimation = shouldReduceMotion
    ? { scale: 1.02 }
    : {
        scale: 1.05,
        y: -8,
        transition: {
          type: "spring",
          stiffness: 400,
          damping: 25,
        },
      };

  /** Handle character selection and dock expand/collapse. */
  const handleCharacterClick = (index: number) => {
    const character = characters[index];

    if (expandedCharacter === index) {
      setExpandedCharacter(null);
      setMessageInput("");
      onDockToggle?.(false);
    } else {
      setExpandedCharacter(index);
      onCharacterSelect?.(character, index);
      onDockToggle?.(true);
    }
  };

  /** Handle sending a message to the selected character. */
  const handleSendMessage = () => {
    if (messageInput.trim() && expandedCharacter !== null) {
      const character = characters[expandedCharacter];

      onMessageSend?.(messageInput, character, expandedCharacter);

      setMessageInput("");

      if (closeOnSend) {
        setExpandedCharacter(null);
        onDockToggle?.(false);
      }
    }
  };

  const selectedCharacter =
    expandedCharacter !== null ? characters[expandedCharacter] : null;
  const isExpanded = expandedCharacter !== null;

  const positionClasses =
    position === "top"
      ? "fixed top-6 left-1/2 -translate-x-1/2 z-50"
      : "fixed bottom-6 left-1/2 -translate-x-1/2 z-50";

  return (
    <motion.div
      ref={dockRef}
      className={cn(positionClasses, className)}
      initial={enableAnimations ? "hidden" : "visible"}
      animate="visible"
      variants={enableAnimations ? containerVariants : {}}
    >
      <motion.div
        className="rounded-full px-4 py-2 shadow-2xl border border-gray-200/50"
        animate={{
          width: isExpanded ? expandedWidth : collapsedWidth,
          background:
            isExpanded && selectedCharacter
              ? `linear-gradient(to right, ${getGradientColors(selectedCharacter)})`
              : theme === "dark"
              ? "#1f2937"
              : "#ffffff",
        }}
        transition={
          enableAnimations
            ? {
                type: "spring",
                stiffness: isExpanded ? 300 : 500,
                damping: isExpanded ? 30 : 35,
                mass: isExpanded ? 0.8 : 0.6,
                background: {
                  duration: 0.2 * animationDuration,
                  ease: "easeInOut",
                },
              }
            : { duration: 0 }
        }
      >
        <div className="flex items-center gap-2 relative">
          {showSparkleButton && (
            <motion.div
              className="flex items-center justify-center"
              animate={{
                opacity: isExpanded ? 0 : 1,
                x: isExpanded ? -20 : 0,
                scale: isExpanded ? 0.8 : 1,
              }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
                delay: 0,
              }}
            >
              <motion.button
                className="w-12 h-12 flex items-center justify-center cursor-pointer"
                whileHover={
                  !isExpanded
                    ? {
                        scale: 1.02,
                        y: -2,
                        transition: {
                          type: "spring",
                          stiffness: 400,
                          damping: 25,
                        },
                      }
                    : undefined
                }
                whileTap={{ scale: 0.95 }}
                aria-label="Sparkle"
              >
                <span className="text-2xl">✨</span>
              </motion.button>
            </motion.div>
          )}

          <motion.div
            className="w-px h-6 bg-gray-300 mr-2 -ml-2"
            animate={{
              opacity: isExpanded ? 0 : 1,
              scaleY: isExpanded ? 0 : 1,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              delay: isExpanded ? 0 : 0.3,
            }}
          />

          {characters.slice(1, -1).map((character, index) => {
            const actualIndex = index + 1;
            const isSelected = expandedCharacter === actualIndex;

            return (
              <motion.div
                key={character.name}
                className={cn(
                  "relative",
                  isSelected && isExpanded && "absolute left-1 top-1 z-20"
                )}
                style={{
                  width: isSelected && isExpanded ? 0 : "auto",
                  minWidth: isSelected && isExpanded ? 0 : "auto",
                  overflow: "visible",
                }}
                animate={{
                  opacity: isExpanded && !isSelected ? 0 : 1,
                  y: isExpanded && !isSelected ? 60 : 0,
                  scale: isExpanded && !isSelected ? 0.8 : 1,
                  x: isSelected && isExpanded ? 0 : 0,
                }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                  delay: isExpanded && !isSelected ? index * 0.05 : isExpanded ? 0.1 : 0,
                }}
              >
                <motion.button
                  className={cn(
                    "relative w-10 h-10 rounded-full flex items-center justify-center text-xl cursor-pointer overflow-hidden",
                    isSelected && isExpanded ? "bg-white/90" : character.backgroundColor
                  )}
                  onClick={() => handleCharacterClick(actualIndex)}
                  whileHover={!isExpanded ? hoverAnimation : { scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label={`Message ${character.name}`}
                >
                  {character.avatar ? (
                    <img
                      src={character.avatar}
                      alt={character.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl">{character.emoji}</span>
                  )}

                  {character.online && (
                    <motion.div
                      className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"
                      initial={{ scale: 0 }}
                      animate={{ scale: isExpanded && !isSelected ? 0 : 1 }}
                      transition={{
                        delay: isExpanded
                          ? isSelected
                            ? 0.3
                            : 0
                          : (index + 1) * 0.1 + 0.5,
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                </motion.button>
              </motion.div>
            );
          })}

          <AnimatePresence>
            {isExpanded && (
              <motion.input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSendMessage();
                  }
                  if (e.key === "Escape" && closeOnEscape) {
                    setExpandedCharacter(null);
                    setMessageInput("");
                    onDockToggle?.(false);
                  }
                }}
                placeholder={placeholder(selectedCharacter?.name || "")}
                className={cn(
                  "w-[300px] absolute left-14 right-0 bg-transparent border-none outline-none text-sm font-medium z-50",
                  theme === "dark"
                    ? "text-gray-100 placeholder-gray-400"
                    : "text-gray-700 placeholder-gray-600"
                )}
                autoFocus={autoFocus}
                initial={{ opacity: 0, x: 20 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: {
                    delay: 0.2,
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: {
                    duration: 0.1,
                    ease: "easeOut",
                  },
                }}
              />
            )}
          </AnimatePresence>

          <motion.div
            className="w-px h-6 bg-gray-300 ml-2 -mr-2"
            animate={{
              opacity: isExpanded ? 0 : 1,
              scaleY: isExpanded ? 0 : 1,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              delay: 0,
            }}
          />

          {showMenuButton && (
            <motion.div
              className={cn(
                "flex items-center justify-center z-20",
                isExpanded && "absolute right-0"
              )}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <AnimatePresence mode="wait">
                {!isExpanded ? (
                  <motion.button
                    key="menu"
                    className="w-12 h-12 flex items-center justify-center cursor-pointer"
                    whileHover={{
                      scale: 1.02,
                      y: -2,
                      transition: {
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      },
                    }}
                    whileTap={{ scale: 0.95 }}
                    aria-label="Menu"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  >
                    <Menu
                      className={theme === "dark" ? "text-gray-300" : "text-gray-600"}
                      size={20}
                    />
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    onClick={handleSendMessage}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white/90 hover:bg-white transition-colors disabled:opacity-50 cursor-pointer relative z-30"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    disabled={!messageInput.trim()}
                    initial={{ opacity: 0, scale: 0, rotate: -90 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      rotate: 0,
                      transition: {
                        delay: 0.25,
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      },
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0,
                      rotate: 90,
                      transition: {
                        duration: 0.1,
                        ease: "easeIn",
                      },
                    }}
                  >
                    <Send
                      className={theme === "dark" ? "text-gray-300" : "text-gray-600"}
                      size={16}
                    />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
