import type { FastifySchema } from 'fastify';

const userAdminResponseSchema = {
  type: 'object',
  required: ['id', 'email', 'name', 'status', 'roles', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] },
    roles: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'INVENTORY_MANAGER', 'CASHIER'],
      },
    },
    emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
    lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const storeMemberResponseSchema = {
  type: 'object',
  required: ['id', 'userId', 'storeId', 'role', 'status', 'user', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    storeId: { type: 'string', format: 'uuid' },
    role: {
      type: 'string',
      enum: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'INVENTORY_MANAGER', 'CASHIER'],
    },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
    user: {
      type: 'object',
      required: ['id', 'email', 'name', 'status'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        name: { type: 'string' },
        status: { type: 'string' },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const paginationMetaSchema = {
  type: 'object',
  required: ['page', 'limit', 'totalItems', 'totalPages', 'hasNextPage', 'hasPrevPage'],
  properties: {
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 20 },
    totalItems: { type: 'integer', example: 50 },
    totalPages: { type: 'integer', example: 3 },
    hasNextPage: { type: 'boolean', example: true },
    hasPrevPage: { type: 'boolean', example: false },
  },
};

export const getUsersSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'List users with filtering and pagination',
  description: 'Returns a paginated list of system users. Excludes password hashes and secrets.',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] },
      role: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'INVENTORY_MANAGER', 'CASHIER'] },
      search: { type: 'string', maxLength: 100 },
      sortBy: { type: 'string', enum: ['name', 'email', 'createdAt', 'status'], default: 'createdAt' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    },
  },
  response: {
    200: {
      description: 'Paginated user list.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: userAdminResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const getUserByIdSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'Get user details by ID',
  description: 'Retrieves user profile and assigned roles.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'User details.',
      type: 'object',
      required: ['statusCode', 'user'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        user: userAdminResponseSchema,
      },
    },
  },
};

export const updateUserSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'Update user profile details',
  description: 'Updates name or email of an existing user account.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', format: 'email', maxLength: 255 },
    },
  },
  response: {
    200: {
      description: 'User updated successfully.',
      type: 'object',
      required: ['statusCode', 'user'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        user: userAdminResponseSchema,
      },
    },
  },
};

export const updateUserStatusSchema: FastifySchema = {
  tags: ['Users'],
  summary: 'Change user account status',
  description: 'Transitions user status between ACTIVE, SUSPENDED, and DEACTIVATED. Safeguards last SUPER_ADMIN.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] },
    },
  },
  response: {
    200: {
      description: 'User status updated successfully.',
      type: 'object',
      required: ['statusCode', 'user'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        user: userAdminResponseSchema,
      },
    },
  },
};

export const getStoreMembersSchema: FastifySchema = {
  tags: ['Store Memberships'],
  summary: 'List members of a store',
  description: 'Returns paginated staff memberships for a specific store.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
      role: { type: 'string', enum: ['STORE_MANAGER', 'INVENTORY_MANAGER', 'CASHIER'] },
    },
  },
  response: {
    200: {
      description: 'Paginated store members.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: storeMemberResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const createStoreMemberSchema: FastifySchema = {
  tags: ['Store Memberships'],
  summary: 'Assign a user to a store with a store-scoped role',
  description: 'Creates a store membership binding an existing user to a store.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['userId', 'role'],
    properties: {
      userId: { type: 'string', format: 'uuid' },
      role: { type: 'string', enum: ['STORE_MANAGER', 'INVENTORY_MANAGER', 'CASHIER'] },
    },
  },
  response: {
    201: {
      description: 'Store membership created successfully.',
      type: 'object',
      required: ['statusCode', 'member'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        member: storeMemberResponseSchema,
      },
    },
  },
};

export const updateStoreMemberSchema: FastifySchema = {
  tags: ['Store Memberships'],
  summary: 'Update store membership role or status',
  description: 'Modifies the store-scoped role or active/inactive status of a member.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId', 'membershipId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
      membershipId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ['STORE_MANAGER', 'INVENTORY_MANAGER', 'CASHIER'] },
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
    },
  },
  response: {
    200: {
      description: 'Store membership updated successfully.',
      type: 'object',
      required: ['statusCode', 'member'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        member: storeMemberResponseSchema,
      },
    },
  },
};

export const deleteStoreMemberSchema: FastifySchema = {
  tags: ['Store Memberships'],
  summary: 'Remove a user membership from a store',
  description: 'Revokes the store membership association.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId', 'membershipId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
      membershipId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Store membership removed successfully.',
      type: 'object',
      required: ['statusCode', 'success', 'message'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Store membership removed successfully.' },
      },
    },
  },
};
