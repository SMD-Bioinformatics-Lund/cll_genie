FROM python:3.11.0-slim as cll_genie_app


LABEL base_image="python:3.11.0-slim"
LABEL about.home="https://github.com/ramsainanduri/cll_genie"

#EXPOSE 5000
#EXPOSE 27017/tcp
WORKDIR /cll_genie

COPY cll_genie/ /cll_genie/cll_genie/
COPY config.py requirements.txt wsgi.py version.py /cll_genie/


ENV PYHTONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=wsgi.py

# Override with docker run:
# docker run -e FLASK_MONGO_URI=your_mongo_host:27017
#ENV FLASK_MONGO_URI=mtlucmds1.lund.skane.se:27017
#ENV FLASK_MONGO_URI=127.0.0.1:27017


# Override when starting with docker run, e.g:
# $ docker run -e LOG_LEVEL=DEBUG [...]
ENV LOG_LEVEL="INFO"


RUN apt update &&\
    apt install -y fonts-liberation libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info && \
    pip install --verbose --no-cache-dir --upgrade pip &&                 \
    pip install --verbose --no-cache-dir --requirement requirements.txt && \ 
    mkdir -p /cll_genie/results/saved_cll_reports && \
    mkdir -p /cll_genie/results/saved_cll_analysis && \
    mkdir -p /cll_genie/logs 


#CMD gunicorn -w 2 -e SCRIPT_NAME=${SCRIPT_NAME} --log-level ${LOG_LEVEL} --bind 0.0.0.0:8000 wsgi:cll_genie
CMD python3 wsgi.py