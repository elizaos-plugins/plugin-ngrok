import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import './index.css';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import Loader from './loader';
import { cn } from './utils';
import {
  Globe,
  Link2,
  Activity,
  Clock,
  Play,
  Square,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  ExternalLink,
} from 'lucide-react';

// Types based on the tunnel service
interface TunnelStatus {
  active: boolean;
  url: string | null;
  port: number | null;
  startedAt: string | null;
  provider: string;
  uptime?: string;
}

interface TunnelConfig {
  port: number;
  region?: string;
  subdomain?: string;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000, // Poll every 5 seconds
      retry: 1,
    },
  },
});

// API Hooks
const useTunnelStatus = () => {
  return useQuery<TunnelStatus, Error>({
    queryKey: ['tunnelStatus'],
    queryFn: async () => {
      const response = await fetch('/api/tunnel/status');
      if (!response.ok) {
        throw new Error('Failed to fetch tunnel status');
      }
      return response.json();
    },
  });
};

const useStartTunnel = () => {
  const queryClient = useQueryClient();

  return useMutation<TunnelStatus, Error, TunnelConfig>({
    mutationFn: async (config) => {
      const response = await fetch('/api/tunnel/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to start tunnel');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnelStatus'] });
    },
  });
};

const useStopTunnel = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error>({
    mutationFn: async () => {
      const response = await fetch('/api/tunnel/stop', {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to stop tunnel');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnelStatus'] });
    },
  });
};

// Components
const TunnelStatusBadge = ({ status }: { status: TunnelStatus }) => {
  if (status.active) {
    return (
      <Badge variant="success" className="flex items-center gap-1" data-testid="badge-success">
        <Activity className="h-3 w-3" />
        Active
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-inactive">
      <XCircle className="h-3 w-3" />
      Inactive
    </Badge>
  );
};

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-8 px-2"
      title="Copy to clipboard"
    >
      {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
};

const ActiveTunnelCard = ({ status }: { status: TunnelStatus }) => {
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Active Tunnel
          </CardTitle>
          <TunnelStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Public URL</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-sm bg-muted p-2 rounded-md break-all">
              {status.url}
            </div>
            <CopyButton text={status.url || ''} />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => window.open(status.url || '', '_blank')}
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Port</Label>
            <p className="font-mono text-sm">{status.port}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Provider</Label>
            <p className="text-sm capitalize">{status.provider}</p>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Uptime
          </Label>
          <p className="text-sm">{status.uptime || 'Just started'}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const StartTunnelForm = () => {
  const [port, setPort] = useState('3000');
  const [region, setRegion] = useState('');
  const [subdomain, setSubdomain] = useState('');

  const startMutation = useStartTunnel();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const config: TunnelConfig = {
      port: parseInt(port, 10),
    };

    if (region) config.region = region;
    if (subdomain) config.subdomain = subdomain;

    startMutation.mutate(config);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start New Tunnel</CardTitle>
        <CardDescription>Create a public HTTPS tunnel to your local server</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="port">
              Port <span className="text-red-500">*</span>
            </Label>
            <Input
              id="port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="3000"
              min="1"
              max="65535"
              required
              disabled={startMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region">Region (Optional)</Label>
            <Input
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us, eu, ap, au, sa, jp, in"
              disabled={startMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subdomain">Subdomain (Optional - Requires paid plan)</Label>
            <Input
              id="subdomain"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="my-custom-domain"
              disabled={startMutation.isPending}
            />
          </div>

          <Button type="submit" disabled={startMutation.isPending} className="w-full">
            {startMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Starting Tunnel...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Tunnel
              </>
            )}
          </Button>

          {startMutation.isError && (
            <div className="flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle className="h-4 w-4" />
              {startMutation.error.message}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
};

function App() {
  const { data: status, isLoading, error } = useTunnelStatus();
  const stopMutation = useStopTunnel();

  const handleStop = () => {
    if (window.confirm('Are you sure you want to stop the tunnel?')) {
      stopMutation.mutate();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Ngrok Tunnel Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your ngrok tunnels and expose your local server to the internet
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center">
            <div data-testid="loader">
              <Loader />
            </div>
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p>Error loading tunnel status: {error.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {status && (
          <div className="space-y-6">
            {status.active ? (
              <>
                <ActiveTunnelCard status={status} />

                <Card>
                  <CardHeader>
                    <CardTitle>Tunnel Controls</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="destructive"
                      onClick={handleStop}
                      disabled={stopMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      {stopMutation.isPending ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Stopping...
                        </>
                      ) : (
                        <>
                          <Square className="mr-2 h-4 w-4" />
                          Stop Tunnel
                        </>
                      )}
                    </Button>

                    {stopMutation.isError && (
                      <p className="mt-2 text-sm text-red-500">
                        Error: {stopMutation.error.message}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <StartTunnelForm />
            )}

            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">Quick Start Guide</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold">1</span>
                  </div>
                  <p>Enter the port number where your local server is running</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold">2</span>
                  </div>
                  <p>Click "Start Tunnel" to create a public HTTPS URL</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold">3</span>
                  </div>
                  <p>Share the generated URL to access your local server from anywhere</p>
                </div>

                <Separator className="my-4" />

                <div className="space-y-2">
                  <p className="font-semibold">Pro Tips:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Use a custom subdomain with a paid ngrok plan for consistent URLs</li>
                    <li>Select a region closest to your users for better performance</li>
                    <li>The tunnel will remain active until you stop it or close the agent</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the root element');
}
