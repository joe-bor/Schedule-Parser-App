import { jest } from '@jest/globals';

// Simple factory for Express Response mock - let Jest handle the types
export const createMockResponse = () => {
  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return mockResponse;
};

// Simple factory for fetch Response mock - minimal typing, maximum compatibility
export const createMockFetchResponse = (data: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 400,
  statusText: ok ? 'OK' : 'Bad Request',  
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data))
}) as Response;