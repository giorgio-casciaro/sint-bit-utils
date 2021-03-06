module.exports = {
  slug: {
    type: 'string',
    description: 'no special chars',
    pattern: '^[a-zA-Z0-9]*$'
  },
  string: {
    type: 'string'
    // description: 'no special chars'
    // pattern: '^[a-zA-Z0-9]*$'
  },
  id: {
    type: 'string',
    description: 'id in format UUID v4',
    pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  },
  description: {
    type: 'string',
    description: 'description, max length 255',
    'maxLength': 255
  },
  updated: { description: 'last update nano timestamp', type: 'integer', minimum: 0 },
  created: { description: 'creation nano timestamp', type: 'integer', minimum: 0 },
  name: {
    description: 'name',
    type: 'string'
  },
  public: {
    description: 'is public',
    type: 'integer',
    minimum: 0
  },
  permissions: {
    description: 'permissions',
    type: 'array',
    items: {type: 'array'}
  },
  rolePermissions: {
    description: 'roles permissions',
    type: 'array',
    items: {type: 'string'}
  },
  maps: {
    description: 'maps info',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        centerLat: { type: 'number' },
        centerLng: { type: 'number' },
        zoom: { type: 'number' }
      },
      required: ['centerLat', 'centerLng']
    }
  },
  pic: {
    description: 'pic file',
    type: 'object',
    properties: {
      size: { type: 'number' },
      mimetype: { type: 'string' },
      path: { type: 'string' }
    },
    required: ['path']
  },
  tags: {
    description: 'tags',
    type: 'array',
    'default': [],
    items: {
      type: 'string', 'minLength': 3, 'maxLength': 50
    }
  },
  email: { description: 'valid email', type: 'string', 'format': 'email' },
  emailStatus: {
    description: '0 - not active, 1 - waiting , 2 - confirmed',
    type: 'integer',
    minimum: 0,
    maximum: 5
  },
  emailConfirmationCode: {
    type: 'string',
    description: 'emailConfirmationCode in format UUID v4',
    pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  },
  salt: {
    type: 'string',
    description: 'salt in format UUID v4',
    pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  },
  password: {
    description: 'Minimum 6 characters at least 1 Uppercase Alphabet, 1 Lowercase Alphabet and 1 Number',
    type: 'string',
    pattern: '^[a-zA-Z0-9_#?!@$%^&*-]{6,30}$'
  },
  firstName: { type: 'string', 'minLength': 2, 'maxLength': 255 },
  birth: { description: 'birth timestamp', type: 'integer' },
  lastName: { type: 'string', 'minLength': 2, 'maxLength': 255 }
}
