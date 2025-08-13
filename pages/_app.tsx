// ../pages/_app.tsx

import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { DataProvider } from '../lib/dataContext';
import { QueryClient, QueryClientProvider } from 'react-query';

const queryClient = new QueryClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <div className="app-container">
      <QueryClientProvider client={queryClient}>
        <DataProvider>
          <Component {...pageProps} />
        </DataProvider>
      </QueryClientProvider>
    </div>
  );
}

export default MyApp;