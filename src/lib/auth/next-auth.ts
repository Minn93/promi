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
        if (!loginRl.ok && loginRl.kind === "over_limit") return null;

        if (isAuthProductReadyServer()) {
          const user = await prisma.user.findUnique({ where: { email: emailRaw } });
          if (!user?.passwordHash || user.disabled) return null;
          const match = await bcrypt.compare(password, user.passwordHash);
          if (!match) return null;
          return { id: user.id, email: user.email };
        }

        /** Dev fallback: env credentials when `PROMI_AUTH_PRODUCT_READY` is off — not allowed as product-ready production auth */
        const configuredEmail = process.env.AUTH_USER_EMAIL?.trim().toLowerCase();
        const configuredPassword = process.env.AUTH_USER_PASSWORD;
        const configuredUserId = process.env.AUTH_USER_ID?.trim();

        if (!configuredEmail || !configuredPassword) {
          return null;
        }

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
