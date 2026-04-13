import { NextResponse } from "next/server";

type ApiErrorOptions = {
  status: number;
  code: string;
  message: string;
  details?: string;
};

export function apiError({ status, code, message, details }: ApiErrorOptions) {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(details ? { details } : {}),
    },
    { status },
  );
}
