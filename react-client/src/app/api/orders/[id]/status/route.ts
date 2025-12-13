import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ message: 'Update order status route', id: params.id });
}

