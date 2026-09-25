/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Plenty of collections — including the local demo artwork under `/mock` —
    // serve SVG. The optimiser refuses it by default because an SVG can carry
    // script, so it is enabled together with the sandbox policy that removes
    // that capability, and `attachment` keeps a browser from ever rendering one
    // as a document on this origin.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: 'https', hostname: 'i.seadn.io' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'arweave.net' },
      { protocol: 'https', hostname: 'raw.githubusercontent.com' },
      { protocol: 'https', hostname: '*.mypinata.cloud' },
      { protocol: 'https', hostname: 'nft-cdn.alchemy.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'assets.coingecko.com' },
      { protocol: 'https', hostname: 'tokens.llama.xyz' }
    ]
  },
  webpack: (config, { webpack }) => {
    // WalletConnect, wagmi, and the Coinbase/Base connectors pull in optional
    // helpers that are only reachable from code paths the dashboard never
    // executes. Stub them so the client bundle builds without Node-only shims.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
      lokijs: false,
      encoding: false,
      bufferutil: false,
      'utf-8-validate': false,
      // MetaMask SDK's browser build imports React Native storage defensively.
      '@react-native-async-storage/async-storage': false
    };

    // The `@x402/*` family is an optional peer of `@coinbase/cdp-sdk` used for
    // HTTP payment flows. It is not published as a dependency of any package in
    // this tree, so every subpath import is left unresolved at bundle time.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));

    if (Array.isArray(config.externals)) {
      config.externals.push('pino-pretty', 'lokijs', 'encoding');
    }

    return config;
  }
};

export default nextConfig;
