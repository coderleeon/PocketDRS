import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pocket-DRS',
    short_name: 'Pocket-DRS',
    description: 'Pocket-DRS - Portable Cricket DRS & Analytics Platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617', // slate-950
    theme_color: '#4f46e5', // indigo-600
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
