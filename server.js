import "dotenv/config";

import express from "express";
import axios from "axios";
import cors from "cors";
import { CookieJar } from "tough-cookie";
import { wrapper as axiosCookieJarSupport } from "axios-cookiejar-support";

const app = express();
const PORT = "3001";

const SUPERSET_DOMAIN = `http://localhost:8088`;
// const SUPERSET_SERVICE_ACCOUNT_USERNAME =
//   process.env.SUPERSET_SERVICE_ACCOUNT_USERNAME;
// const SUPERSET_SERVICE_ACCOUNT_PASSWORD =
//   process.env.SUPERSET_SERVICE_ACCOUNT_PASSWORD;

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

// // Get access token using login credentials or use provided keycloak token
// async function getSupersetAccessToken() {
//   try {
//     const loginUrl = `${SUPERSET_DOMAIN}/api/v1/security/login`;
//     // account credentials assigned to the back end aka service account that has authority to issue guest tokens
//     const payload = {
//       username: SUPERSET_SERVICE_ACCOUNT_USERNAME,
//       password: SUPERSET_SERVICE_ACCOUNT_PASSWORD,
//       provider: "db", // Assuming 'db' provider for the service account
//       refresh: true,
//     };

//     const response = await axiosInstance.post(loginUrl, payload, {
//       headers: {
//         "Content-Type": "application/json",
//       },
//     });

//     return response.data.access_token;
//   } catch (error) {
//     console.error(
//       "Error getting Superset access token:",
//       error.response ? error.response.data : error.message
//     );
//     throw new Error("Failed to get Superset access token");
//   }
// }

// Get CSRF token using access token, CSRF required to POST and get guest token
async function getSupersetCsrfToken(accessToken) {
  try {
    const csrfUrl = `${SUPERSET_DOMAIN}/api/v1/security/csrf_token/`;
    console.log("Getting CSRF token with access token:", accessToken);
    const response = await axiosInstance.get(csrfUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
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

const generateGuestTokenFromCustomEndpoint = async (accessToken, csrfToken, dashboardId) => {
  console.log("Token:", accessToken, csrfToken);
  const url =
    "http://localhost:8088/api/v1/guest/guest_token_sso";
    
  const payload = {
    jwt: accessToken,
    dashboard_ids: [dashboardId],
  };

  const response = await axiosInstance.post(url, payload, {
    headers: {
      "Content-Type": "application/json",
      Referer: "http://localhost:8088/",
      Authorization: `Bearer ${accessToken}`,
      "X-CSRF-Token": csrfToken,
      "X-CSRFToken": csrfToken,
    },
  });
  console.log("Guest Token Response:", response.data);

  return response.data.guest_token;
};

app.post("/api/guest-token", async (req, res) => {

  const userFilters = [];
  const accessToken = req.body.accessToken;
  const dashboardId = req.body.dashboardId;

  try {
    const { csrfToken } = await getSupersetCsrfToken(accessToken);
    // const guestToken = await generateGuestToken(
    //   accessToken,
    //   csrfToken,
    //   userFilters,
    //   resources
    // );
    const guestToken = await generateGuestTokenFromCustomEndpoint(
      accessToken,
      csrfToken,
      dashboardId
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
