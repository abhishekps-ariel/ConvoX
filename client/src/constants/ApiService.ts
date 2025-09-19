 // Centralized API service with helper functions
export class ApiService {
  private static getAuthHeaders(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  private static getJsonHeaders(token: string) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  // Helper function for GET requests with auth
  static async makeGetRequest<T>(
    url: string,
    token: string,
    logout?: () => void,
    operationName?: string
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        headers: this.getAuthHeaders(token),
      });

      if (response.status === 401 || response.status === 403) {
        logout?.();
        return [] as T;
      }
      if (!response.ok) {
        throw new Error(`Error ${operationName || 'fetching data'}: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API ${operationName || 'request'} error:`, error);
      return [] as T;
    }
  }

  // Helper function for POST/PUT/DELETE requests with auth
  static async makeRequest<T>(
    url: string,
    token: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body?: any,
    operationName?: string
  ): Promise<T | null> {
    try {
      const headers = body 
        ? this.getJsonHeaders(token)
        : this.getAuthHeaders(token);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${operationName || 'performing operation'}: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API ${operationName || 'request'} error:`, error);
      throw error;
    }
  }

  // Helper function for requests that return data with specific structure
  static async makeDataRequest<T>(
    url: string,
    token: string,
    method: 'POST' | 'PUT' = 'POST',
    body?: any,
    dataKey?: string,
    operationName?: string
  ): Promise<T | null> {
    // eslint-disable-next-line no-useless-catch
    try {
      const response = await this.makeRequest<any>(url, token, method, body, operationName);
      return dataKey ? response?.[dataKey] : response;
    } catch (error) {
      throw error;
    }
  }
}
