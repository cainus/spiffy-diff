import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  onReset: () => void
}

/** Shows the error instead of an empty window when a view fails to render. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold">Spiffy cannot show this view.</h1>
        <pre className="text-muted-foreground max-w-2xl text-xs whitespace-pre-wrap">
          {this.state.error.message}
        </pre>
        <Button
          onClick={() => {
            this.setState({ error: null })
            this.props.onReset()
          }}
        >
          Go back to the start
        </Button>
      </div>
    )
  }
}
