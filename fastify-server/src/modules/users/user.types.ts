import type { Role, UserStatus } from '../auth/auth.types.js';
import type { PaginatedResult } from '../../common/types/pagination.js';

export type MembershipStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface UpdateUserDto {
  name?: string;
  email?: string;
}

export interface UpdateUserStatusDto {
  status: UserStatus;
}

export interface UserQueryDto {
  page?: number;
  limit?: number;
  status?: UserStatus;
  role?: Role;
  search?: string;
  sortBy?: 'name' | 'email' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface UserAdminResponseDto {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  roles: Role[];
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedUsersResponse = PaginatedResult<UserAdminResponseDto>;

export interface CreateStoreMemberDto {
  userId: string;
  role: Role;
}

export interface UpdateStoreMemberDto {
  role?: Role;
  status?: MembershipStatus;
}

export interface StoreMemberQueryDto {
  page?: number;
  limit?: number;
  status?: MembershipStatus;
  role?: Role;
}

export interface StoreMemberResponseDto {
  id: string;
  userId: string;
  storeId: string;
  role: Role;
  status: MembershipStatus;
  user: {
    id: string;
    email: string;
    name: string;
    status: UserStatus;
  };
  createdAt: string;
  updatedAt: string;
}

export type PaginatedStoreMembersResponse = PaginatedResult<StoreMemberResponseDto>;
