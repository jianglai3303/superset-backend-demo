import "dotenv/config";

import express from "express";
import axios from "axios";
import cors from "cors";
import { CookieJar } from "tough-cookie";
import { wrapper as axiosCookieJarSupport } from "axios-cookiejar-support";

const app = express();
const PORT = "3001";

const SUPERSET_DOMAIN = `https://{{projectCode}}-superset.dev.indocpilot.io`;

const cookieJar = new CookieJar();
// create axios instance that uses cookie jar
const axiosInstance = axios.create({
  jar: cookieJar,
  withCredentials: true,
});
axiosCookieJarSupport(axiosInstance); // modifies axios object to add interceptors that manages cookies and stores them in cookie jar

// Middleware
app.use(express.json()); // To parse JSON request bodies
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true, // Allow cookies/authorization headers to be sent
  })
);

// Get CSRF token using access token, CSRF required to POST and get guest token
async function getSupersetCsrfToken(projectCode, accessToken) {
  try {
    const csrfUrl = `${SUPERSET_DOMAIN.replace('{{projectCode}}', projectCode)}/api/v1/security/csrf_token/`;
    const response = await axiosInstance.get(csrfUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log("CSRF Token Response:", response.data);
    return {
      csrfToken: response.data.result,
    };
  } catch (error) {
    console.error(
      "Error getting Superset CSRF token:",
      error.response ? error.response.data : error.message
    );
    throw new Error("Failed to get Superset CSRF token");
  }
}

const generateGuestTokenFromCustomEndpoint = async (projectCode, accessToken, csrfToken, dashboardIds) => {
  const url =
    `${SUPERSET_DOMAIN.replace('{{projectCode}}', projectCode)}/api/v1/guest/guest_token_sso`;
    
  const payload = {
    jwt: accessToken,
    dashboard_ids: dashboardIds,
  };
  const response = await axiosInstance.post(url, payload, {
    headers: {
      "Content-Type": "application/json",
      Referer: SUPERSET_DOMAIN.replace('{{projectCode}}', projectCode),
      Authorization: `Bearer ${accessToken}`,
      "X-CSRFToken": csrfToken,
    },
  });
  console.log("Guest Token Response:", response.data);

  return response.data.guest_token;
};

app.post("/v1/superset/:project_code/guesttoken/request", async (req, res) => {

  const projectCode = req.params.project_code;
  const Authorization = req.headers.authorization;
  const accessToken = Authorization.replace("Bearer ", "");
  const dashboardIds = req.body.dashboard_ids;
  try {
    const { csrfToken } = await getSupersetCsrfToken(projectCode, accessToken);
    const guestToken = await generateGuestTokenFromCustomEndpoint(
      projectCode,
      accessToken,
      csrfToken,
      dashboardIds
    );

    res.json({ token: guestToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Superset Domain: ${SUPERSET_DOMAIN}`);
});
