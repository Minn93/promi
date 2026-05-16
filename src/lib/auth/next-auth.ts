import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import {
  isAuthProductReadyServer,
} from "@/src/lib/internal-beta-mode";
import {
  consumeRateLimit,
  getClientIpFromHeaders,
  hashEmailForRateLimit,
  RATE_LIMITS,
} from "@/src/lib/rate-limit/server";

function isLoginDebugEnabled(): boolean {
  const v = process.env.PROMI_AUTH_DEBUG_LOGIN?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function loginDebugLog(payload: Record<string, unknown>) {
  if (!isLoginDebugEnabled()) return;
  console.info("[auth/login:debug]", payload);
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Promi Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailRaw = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        loginDebugLog({
          step: "received_credentials",
          hasEmail: emailRaw.length > 0,
          normalizedEmail: emailRaw || null,
          hasPassword: password.length > 0,
        });
        if (!emailRaw || !password) return null;

        const h = await headers();
        const ip = getClientIpFromHeaders(h);
        const loginRl = await consumeRateLimit({
          namespace: "login",
          identifier: `${hashEmailForRateLimit(emailRaw)}:${ip}`,
          max: RATE_LIMITS.login.max,
          window: RATE_LIMITS.login.window,
          onStoreMissing: "pass",
        });
        loginDebugLog({
          step: "rate_limit",
          ok: loginRl.ok,
          kind: loginRl.ok ? "ok" : loginRl.kind,
        });
        if (!loginRl.ok && loginRl.kind === "over_limit") return null;

        const productReady = isAuthProductReadyServer();
        loginDebugLog({
          step: "auth_mode",
          productReady,
          mode: productReady ? "db_credentials" : "env_fallback_credentials",
        });

        if (productReady) {
          const user = await prisma.user.findUnique({ where: { email: emailRaw } });
          loginDebugLog({
            step: "db_user_lookup",
            userFound: Boolean(user),
            disabled: user?.disabled ?? null,
            passwordHashPresent: Boolean(user?.passwordHash),
          });
          if (!user?.passwordHash || user.disabled) return null;
          const match = await bcrypt.compare(password, user.passwordHash);
          loginDebugLog({
            step: "db_password_verify",
            passwordVerifyResult: match,
          });
          if (!match) return null;
          return { id: user.id, email: user.email };
        }

        /** Dev fallback: env credentials when `PROMI_AUTH_PRODUCT_READY` is off — not allowed as product-ready production auth */
        const configuredEmail = process.env.AUTH_USER_EMAIL?.trim().toLowerCase();
        const configuredPassword = process.env.AUTH_USER_PASSWORD;
        const configuredUserId = process.env.AUTH_USER_ID?.trim();
        loginDebugLog({
          step: "env_fallback_config",
          configuredEmailPresent: Boolean(configuredEmail),
          configuredPasswordPresent: Boolean(configuredPassword),
          configuredUserIdPresent: Boolean(configuredUserId),
        });

        if (!configuredEmail || !configuredPassword) {
          return null;
        }

        const envMatch = emailRaw === configuredEmail && password === configuredPassword;
        loginDebugLog({
          step: "env_fallback_verify",
          emailMatchesConfigured: emailRaw === configuredEmail,
          passwordMatchesConfigured: password === configuredPassword,
          verifyResult: envMatch,
        });
        if (emailRaw !== configuredEmail || password !== configuredPassword) {
          return null;
        }

        return {
          id: configuredUserId && configuredUserId.length > 0 ? configuredUserId : configuredEmail,
          email: configuredEmail,
          name: "Promi User",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.sub === "string") {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
