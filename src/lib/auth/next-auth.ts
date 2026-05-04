import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Promi Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const configuredEmail = process.env.AUTH_USER_EMAIL?.trim();
        const configuredPassword = process.env.AUTH_USER_PASSWORD;
        const configuredUserId = process.env.AUTH_USER_ID?.trim();

        if (!configuredEmail || !configuredPassword) {
          return null;
        }

        const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        if (email !== configuredEmail || password !== configuredPassword) return null;

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
