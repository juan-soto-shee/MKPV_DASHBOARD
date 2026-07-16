FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY plantview_predictive ./plantview_predictive
COPY artifacts/candidates/v20260716T195727256557Z/cu_pls_4h.joblib ./artifacts/candidates/v20260716T195727256557Z/
COPY artifacts/candidates/v20260716T195727256557Z/cu_pls_8h.joblib ./artifacts/candidates/v20260716T195727256557Z/
COPY artifacts/candidates/v20260716T195727256557Z/cu_pls_12h.joblib ./artifacts/candidates/v20260716T195727256557Z/
CMD ["sh", "-c", "uvicorn plantview_predictive.main:app --host 0.0.0.0 --port ${PORT}"]
