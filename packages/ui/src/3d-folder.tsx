/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { ReactNode } from "react"
import { forwardRef, useState } from "react"
import { cn } from "@/lib/utils"

export type AnimatedFolderProject = {
  id: string
  image: string
  title: string
  icon?: ReactNode
  uri?: string
  ext?: string
  projectId?: string
  rootUri?: string
  kind?: "file" | "folder"
}

interface AnimatedFolderProps {
  title: string
  projects: AnimatedFolderProject[]
  className?: string
  /** Optional controlled hover state for external hit testing. */
  hovered?: boolean
  /** Toggle interactive behaviors like hover handlers and clicks. */
  interactive?: boolean
  /** Optional project open handler for preview. */
  onProjectOpen?: (project: AnimatedFolderProject) => void
  /** Optional folder open handler for clicking the folder body. */
  onFolderOpen?: () => void
}

export function AnimatedFolder({
  title,
  projects,
  className,
  hovered,
  interactive = true,
  onProjectOpen,
  onFolderOpen,
}: AnimatedFolderProps) {
  const [isHovered, setIsHovered] = useState(false)
  const resolvedHover = hovered ?? isHovered

  const handleProjectClick = (project: AnimatedFolderProject) => {
    if (!interactive || !resolvedHover) return
    onProjectOpen?.(project)
  }

  return (
    <>
      <div
        className={cn(
          "relative flex flex-col items-center justify-center",
          "p-8 rounded-2xl",
          "bg-card border border-border",
          "transition-all duration-500 ease-out",
          resolvedHover && "shadow-2xl shadow-accent/10 border-accent/30",
          interactive ? "cursor-pointer" : "cursor-default",
          !interactive && "pointer-events-none",
          "group",
          className,
        )}
        style={{
          minWidth: "280px",
          minHeight: "320px",
          perspective: "1000px",
        }}
        onClick={interactive ? onFolderOpen : undefined}
        onMouseEnter={
          hovered === undefined && interactive ? () => setIsHovered(true) : undefined
        }
        onMouseLeave={
          hovered === undefined && interactive ? () => setIsHovered(false) : undefined
        }
      >
        {/* Subtle background glow on hover */}
        <div
          className="absolute inset-0 rounded-2xl transition-opacity duration-500"
          style={{
            background: "radial-gradient(circle at 50% 70%, var(--accent) 0%, transparent 70%)",
            opacity: resolvedHover ? 0.08 : 0,
          }}
        />

        <div className="relative flex items-center justify-center mb-4" style={{ height: "160px", width: "200px" }}>
          {/* Folder back layer - z-index 10 */}
          <div
            className="absolute w-32 h-24 bg-folder-back rounded-lg shadow-md"
            style={{
              transformOrigin: "bottom center",
              transform: resolvedHover ? "rotateX(-15deg)" : "rotateX(0deg)",
              transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              zIndex: 10,
            }}
          />

          {/* Folder tab - z-index 10 */}
          <div
            className="absolute w-12 h-4 bg-folder-tab rounded-t-md"
            style={{
              top: "calc(50% - 48px - 12px)",
              left: "calc(50% - 64px + 16px)",
              transformOrigin: "bottom center",
              transform: resolvedHover ? "rotateX(-25deg) translateY(-2px)" : "rotateX(0deg)",
              transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              zIndex: 10,
            }}
          />

          {/* Project cards - z-index 20, between back and front */}
          <div
            className="absolute"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 20,
            }}
          >
            {projects.slice(0, 3).map((project, index) => (
              <ProjectCard
                key={project.id}
                image={project.image}
                title={project.title}
                icon={project.icon}
                delay={index * 80}
                isVisible={resolvedHover}
                index={index}
                onClick={() => handleProjectClick(project)}
                interactive={interactive}
              />
            ))}
          </div>

          {/* Folder front layer - z-index 30 */}
          <div
            className="absolute w-32 h-24 bg-folder-front rounded-lg shadow-lg"
            style={{
              top: "calc(50% - 48px + 4px)",
              transformOrigin: "bottom center",
              transform: resolvedHover ? "rotateX(25deg) translateY(8px)" : "rotateX(0deg)",
              transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              zIndex: 30,
            }}
          />

          {/* Folder shine effect - z-index 31 */}
          <div
            className="absolute w-32 h-24 rounded-lg overflow-hidden pointer-events-none"
            style={{
              top: "calc(50% - 48px + 4px)",
              background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%)",
              transformOrigin: "bottom center",
              transform: resolvedHover ? "rotateX(25deg) translateY(8px)" : "rotateX(0deg)",
              transition: "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              zIndex: 31,
            }}
          />
        </div>

        {/* Folder title */}
        <h3
          className="text-lg font-semibold text-foreground mt-4 transition-all duration-300"
          style={{
            transform: resolvedHover ? "translateY(4px)" : "translateY(0)",
          }}
        >
          {title}
        </h3>

        {/* Project count */}
        <p
          className="text-sm text-muted-foreground transition-all duration-300"
          style={{
            opacity: resolvedHover ? 0.7 : 1,
          }}
        >
          {projects.length} projects
        </p>

        {/* Hover hint */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-xs text-muted-foreground transition-all duration-300"
          style={{
            opacity: resolvedHover ? 0 : 0.6,
            transform: resolvedHover ? "translateY(10px)" : "translateY(0)",
          }}
        >
          <span>Hover to explore</span>
        </div>
      </div>

    </>
  )
}


interface ProjectCardProps {
  image: string
  title: string
  icon?: ReactNode
  delay: number
  isVisible: boolean
  index: number
  onClick: () => void
  interactive: boolean
}

export const ProjectCard = forwardRef<HTMLDivElement, ProjectCardProps>(
  ({ image, title, icon, delay, isVisible, index, onClick, interactive }, ref) => {
    const rotations = [-12, 0, 12]
    const translations = [-55, 0, 55]
    const hasImage = Boolean(image)

    return (
      <div
        ref={ref}
        className={cn(
          "absolute w-20 h-28 rounded-lg overflow-hidden shadow-xl",
          "bg-card border border-border",
          interactive ? "cursor-pointer hover:ring-2 hover:ring-accent/50" : "cursor-default",
        )}
        style={{
          transform: isVisible
            ? `translateY(-90px) translateX(${translations[index]}px) rotate(${rotations[index]}deg) scale(1)`
            : "translateY(0px) translateX(0px) rotate(0deg) scale(0.5)",
          opacity: isVisible ? 1 : 0,
          transition: `all 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`,
          zIndex: 10 - index,
          left: "-40px",
          top: "-56px",
        }}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        {hasImage ? (
          <>
            <img src={image} alt={title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground">
            {icon ?? (
              <img src="/placeholder.svg" alt={title} className="h-10 w-10 object-contain" />
            )}
          </div>
        )}
        <p className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] font-medium text-primary-foreground truncate">
          {title}
        </p>
      </div>
    )
  },
)

ProjectCard.displayName = "ProjectCard"
