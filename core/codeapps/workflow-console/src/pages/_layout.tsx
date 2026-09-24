import { Outlet, NavLink } from "react-router-dom"
import { CircleUser } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { useIdentity } from "@/hooks/use-identity"
import { useContextDeepLink } from "@/hooks/use-context-deep-link"

type LayoutProps = { showHeader?: boolean }

const NAV = [
  { to: "/tasks", label: "My tasks" },
  { to: "/instances", label: "Processes" },
]

export default function Layout({ showHeader = true }: LayoutProps) {
  const { fullName, userPrincipalName, teams } = useIdentity()
  useContextDeepLink()

  return (
    <div className="min-h-dvh flex flex-col">
      {showHeader && (
        <header className="h-14 border-b flex items-center">
          <div className="mx-auto w-full max-w-7xl px-6 flex items-center justify-between">
            <nav className="flex items-center gap-4">
              <span className="text-sm font-semibold">Workflow Console</span>
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `text-sm text-muted-foreground hover:text-foreground ${isActive ? "text-foreground font-medium" : ""}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <span
                className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground"
                title={`${userPrincipalName ?? ""} - ${teams.length} team(s)`}
              >
                <CircleUser className="size-4" />
                {fullName ?? userPrincipalName ?? "Unknown user"}
              </span>
              <ModeToggle />
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 flex">
        <div className="flex-1 mx-auto w-full max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}