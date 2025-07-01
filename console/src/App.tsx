import { RouterProvider } from "react-router-dom"
import { ThemeProvider } from "./components/ui/theme-provider"
import { router } from "./routers"

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <RouterProvider router={router} />
    </ThemeProvider>

  )
}

export default App