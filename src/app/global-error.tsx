"use client";

import { diagnose } from "@/lib/db-diagnosis";

/**
 * Kök yerleşimde (layout) oluşan hatalar error.tsx'e ulaşmaz; Next.js
 * yalnızca global-error'ı çağırır ve kök yerleşimi tamamen atlar. Ortam
 * değişkeni ve veritabanı bağlantısı hataları tam olarak buraya düşer.
 *
 * Kök yerleşim atlandığı için globals.css de yüklenmez — bu yüzden stiller
 * satır içi yazıldı. Böylece ekran her koşulda okunur kalır.
 */

const ink = "#0b1c33";
const muted = "#556d92";
const line = "#dbe3ee";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const setup = process.env.NODE_ENV === "development" ? diagnose(error) : null;

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "#f5f7fa",
          color: ink,
          font: "16px/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px" }}>
          {setup ? (
            <>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: muted }}>
                Kurulum
              </p>
              <h1 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 600 }}>{setup.title}</h1>
              <p style={{ margin: "8px 0 0", fontSize: 15, color: muted }}>{setup.detail}</p>

              {setup.file && (
                <p
                  style={{
                    display: "inline-block",
                    margin: "16px 0 0",
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: "#fff",
                    border: `1px solid ${line}`,
                    font: "13px ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {setup.file}
                </p>
              )}

              <ol style={{ margin: "20px 0 0", padding: 0, listStyle: "none" }}>
                {setup.steps.map((step, i) => (
                  <li key={i} style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 15 }}>
                    <span
                      style={{
                        flex: "0 0 auto",
                        width: 22,
                        height: 22,
                        marginTop: 2,
                        borderRadius: 999,
                        background: ink,
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <p
                style={{
                  margin: "24px 0 0",
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "#fff",
                  border: `1px solid ${line}`,
                  fontSize: 13,
                  color: muted,
                }}
              >
                Terminalde{" "}
                <code style={{ font: "13px ui-monospace, SFMono-Regular, Menlo, monospace", color: ink }}>
                  npm run db:check
                </code>{" "}
                yazarak bağlantıyı tek komutla sınayabilirsiniz.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Bir şeyler ters gitti</h1>
              <p style={{ margin: "8px 0 0", fontSize: 15, color: muted }}>
                Uygulama başlatılırken beklenmedik bir hata oluştu.
              </p>
              {error.digest && (
                <p style={{ margin: "8px 0 0", font: "12px ui-monospace, monospace", color: muted }}>
                  Hata kodu: {error.digest}
                </p>
              )}
            </>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: "none",
              background: ink,
              color: "#fff",
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>

          {setup && (
            <p style={{ margin: "32px 0 0", fontSize: 12, color: muted }}>
              Bu ekran yalnızca geliştirme sırasında görünür.
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
