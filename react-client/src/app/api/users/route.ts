import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  return NextResponse.json({ message: 'Get users route (Admin only)' });
}

export async function POST(request: Request) {
  return NextResponse.json({ message: 'Create user route (Admin only)' });
}

