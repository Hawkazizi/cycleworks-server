// src/services/smsService.js
import axios from "axios";

const SMS_API = "https://api.sms.ir/v1/send/verify";
const SANDBOX_KEY = process.env.SMS_SANDBOX_KEY; // keep key in .env

// Send SMS verification code
export async function sendVerificationCode(mobile, code) {
  const body = {
    mobile,
    templateId: 123456, // sandbox default template
    parameters: [{ name: "Code", value: code }],
  };

  const res = await axios.post(SMS_API, body, {
    headers: {
      "Content-Type": "application/json",
      Accept: "text/plain",
      "x-api-key": SANDBOX_KEY,
    },
  });

  return res.data;
}
