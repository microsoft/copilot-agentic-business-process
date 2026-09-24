import { ThemeProvider } from "@/providers/theme-provider"
import { SonnerProvider } from "@/providers/sonner-provider"
import { QueryProvider } from "./providers/query-provider"
import { IdentityProvider } from "@/providers/identity-provider"
import { RouterProvider } from "react-router-dom"
import { router } from "@/router"

export default function App() {
  return (
    <ThemeProvider>
      <SonnerProvider>
        <QueryProvider>
          <IdentityProvider>
            <RouterProvider router={router} />
          </IdentityProvider>
        </QueryProvider>
      </SonnerProvider>
    </ThemeProvider>
  )
}