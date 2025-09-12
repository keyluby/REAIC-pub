const { z } = require('zod');

// Import the functions we want to test
// Note: In a real environment, you'd import from the actual file
// For this test, we'll define a simplified version to demonstrate testing approach

// Test schema for validation
const TestSchema = z.object({
  name: z.string().optional(),
  age: z.coerce.number().optional(),
  email: z.string().email().optional(),
  active: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  personalInfo: z.object({
    phone: z.string().optional(),
    address: z.string().optional()
  }).optional()
}).passthrough();

// Simplified version of the functions for testing
const FIELD_ALIASES = {
  'personal': 'personalInfo',
  'personal_info': 'personalInfo',
  'phone_number': 'phone',
  'is_active': 'active'
};

function normalizeAliases(obj, aliases) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeAliases(item, aliases));
  }
  
  const normalized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = aliases[key] || key;
    
    if (value && typeof value === 'object') {
      normalized[normalizedKey] = normalizeAliases(value, aliases);
    } else {
      normalized[normalizedKey] = value;
    }
  }
  
  return normalized;
}

function parseAndNormalize(jsonString, schema, aliases = {}) {
  const issues = [];
  let raw = null;
  
  // Step 1: Parse JSON
  try {
    if (!jsonString || jsonString.trim() === '') {
      issues.push('Empty or null JSON string received');
      return { data: null, issues, raw: null };
    }
    
    raw = JSON.parse(jsonString);
  } catch (parseError) {
    issues.push(`JSON parsing failed: ${parseError.message}`);
    return { data: null, issues, raw: null };
  }
  
  // Step 2: Normalize field aliases
  const combinedAliases = { ...FIELD_ALIASES, ...aliases };
  const normalizedData = normalizeAliases(raw, combinedAliases);
  
  // Step 3: Validate with Zod schema
  const validationResult = schema.safeParse(normalizedData);
  
  if (!validationResult.success) {
    const errorMessages = validationResult.error.errors.map(err => 
      `${err.path.join('.')}: ${err.message}`
    );
    issues.push(...errorMessages);
    
    return { data: null, issues, raw };
  }
  
  return { data: validationResult.data, issues, raw };
}

// Unit Tests
describe('parseAndNormalize Function Tests', () => {
  
  test('should parse valid JSON successfully', () => {
    const jsonString = JSON.stringify({
      name: 'John Doe',
      age: '30',
      email: 'john@example.com',
      active: true
    });
    
    const result = parseAndNormalize(jsonString, TestSchema);
    
    expect(result.data).not.toBeNull();
    expect(result.data.name).toBe('John Doe');
    expect(result.data.age).toBe(30); // String coerced to number
    expect(result.data.email).toBe('john@example.com');
    expect(result.data.active).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
  
  test('should handle null and undefined fields', () => {
    const jsonString = JSON.stringify({
      name: null,
      age: undefined,
      email: 'test@example.com'
    });
    
    const result = parseAndNormalize(jsonString, TestSchema);
    
    expect(result.data).not.toBeNull();
    expect(result.data.name).toBeNull();
    expect(result.data.email).toBe('test@example.com');
    expect(result.issues).toHaveLength(0);
  });
  
  test('should coerce string numeric values', () => {
    const jsonString = JSON.stringify({
      name: 'Jane',
      age: '25', // String that should be coerced to number
      email: 'jane@example.com'
    });
    
    const result = parseAndNormalize(jsonString, TestSchema);
    
    expect(result.data).not.toBeNull();
    expect(result.data.age).toBe(25);
    expect(typeof result.data.age).toBe('number');
    expect(result.issues).toHaveLength(0);
  });
  
  test('should normalize field aliases', () => {
    const jsonString = JSON.stringify({
      name: 'Bob',
      is_active: true, // Alias should be normalized to 'active'
      personal: { // Alias should be normalized to 'personalInfo'
        phone_number: '123-456-7890' // Nested alias
      }
    });
    
    const result = parseAndNormalize(jsonString, TestSchema);
    
    expect(result.data).not.toBeNull();
    expect(result.data.active).toBe(true);
    expect(result.data.personalInfo).toBeDefined();
    expect(result.data.personalInfo.phone).toBe('123-456-7890');
    expect(result.issues).toHaveLength(0);
  });
  
  test('should handle custom aliases', () => {
    const jsonString = JSON.stringify({
      full_name: 'Alice Smith',
      years_old: '28'
    });
    
    const customAliases = {
      'full_name': 'name',
      'years_old': 'age'
    };
    
    const result = parseAndNormalize(jsonString, TestSchema, customAliases);
    
    expect(result.data).not.toBeNull();
    expect(result.data.name).toBe('Alice Smith');
    expect(result.data.age).toBe(28);
    expect(result.issues).toHaveLength(0);
  });
  
  test('should return errors for invalid JSON', () => {
    const invalidJson = '{ name: "John", age: 30 }'; // Missing quotes around key
    
    const result = parseAndNormalize(invalidJson, TestSchema);
    
    expect(result.data).toBeNull();
    expect(result.issues).toContain(expect.stringContaining('JSON parsing failed'));
    expect(result.raw).toBeNull();
  });
  
  test('should return errors for schema validation failures', () => {
    const jsonString = JSON.stringify({
      name: 'John',
      age: 'not-a-number', // This will fail coercion
      email: 'invalid-email' // Invalid email format
    });
    
    const result = parseAndNormalize(jsonString, TestSchema);
    
    expect(result.data).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some(issue => issue.includes('email'))).toBe(true);
  });
  
  test('should handle empty and null input', () => {
    expect(parseAndNormalize('', TestSchema).data).toBeNull();
    expect(parseAndNormalize(null, TestSchema).data).toBeNull();
    expect(parseAndNormalize(undefined, TestSchema).data).toBeNull();
  });
  
  test('should preserve unknown fields with passthrough', () => {
    const jsonString = JSON.stringify({
      name: 'John',
      age: 30,
      unknownField: 'should be preserved',
      customData: { nested: 'value' }
    });
    
    const result = parseAndNormalize(jsonString, TestSchema);
    
    expect(result.data).not.toBeNull();
    expect(result.data.name).toBe('John');
    expect(result.data.age).toBe(30);
    expect(result.data.unknownField).toBe('should be preserved');
    expect(result.data.customData).toEqual({ nested: 'value' });
    expect(result.issues).toHaveLength(0);
  });
  
  test('should apply default values from schema', () => {
    const jsonString = JSON.stringify({
      name: 'John'
      // active and tags not provided - should get defaults
    });
    
    const result = parseAndNormalize(jsonString, TestSchema);
    
    expect(result.data).not.toBeNull();
    expect(result.data.name).toBe('John');
    expect(result.data.active).toBe(false); // Default value
    expect(result.data.tags).toEqual([]); // Default empty array
    expect(result.issues).toHaveLength(0);
  });

});

// Export for potential use in other test files
module.exports = {
  parseAndNormalize,
  normalizeAliases,
  TestSchema,
  FIELD_ALIASES
};