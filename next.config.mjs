/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/astroberry/:path*',
                destination: 'http://192.168.178.29:5000/:path*',
            },
            {
                source: '/api/indi/:path*',
                destination: 'http://192.168.178.29:5000/:path*',
            },
        ];
    },
};

export default nextConfig;
