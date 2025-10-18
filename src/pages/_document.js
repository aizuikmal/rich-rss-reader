import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <title>RSS Reader with Media Parser</title>
        <meta name="description" content="RSS reader that parses and shows full text, images, and video links." />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="RSS Reader with Media Parser" />
        <meta property="og:description" content="RSS reader that parses and shows full text, images, and video links." />
        <meta property="og:image" content="/share.png" />
        <meta property="og:url" content="https://rich-rss-reader.pages.dev" />
        <meta property="og:site_name" content="RSS Reader with Media Parser" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="RSS Reader with Media Parser" />
        <meta name="twitter:description" content="RSS reader that parses and shows full text, images, and video links." />
        <meta name="twitter:image" content="/share.png" />
        
        {/* Additional meta tags */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#4f46e5" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Google Analytics */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-Y5BYQ83T8C"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-Y5BYQ83T8C', {
                page_title: 'RSS Reader',
                custom_map: {'custom_parameter_1': 'feed_url'}
              });
            `,
          }}
        />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
