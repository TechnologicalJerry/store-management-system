import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  return NextResponse.json({ message: 'Get customers route' });
}

export async function POST(request: Request) {
  return NextResponse.json({ message: 'Create customer route' });
}

