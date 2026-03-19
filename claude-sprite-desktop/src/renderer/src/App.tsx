import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './assets/main.css'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <p className="p-4">Claude Sprite Desktop -- Shell ready</p>
      </div>
    </QueryClientProvider>
  )
}

export default App
