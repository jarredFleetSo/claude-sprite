import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { useConfig } from './hooks/useConfig'
import SetupWizard from './routes/SetupWizard'
import { Dashboard } from './routes/Dashboard'
import './assets/main.css'
import '@xterm/xterm/css/xterm.css'

const queryClient = new QueryClient()

function AppContent() {
  const { data: config, isLoading } = useConfig()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!config) {
    return <SetupWizard />
  }

  if (config.autoImported && !config.anthropicApiKey) {
    return <SetupWizard initialStep={3} initialOrg={config.org} />
  }

  return <Dashboard />
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AppContent />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
