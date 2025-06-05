# CLL Genie

![Python 3.12+](https://img.shields.io/badge/python-3.12+-orange.svg)
![Flask](https://img.shields.io/badge/framework-Flask-indigo)
![MongoDB](https://img.shields.io/badge/database-MongoDB-brightgreen)
![Dockerized](https://img.shields.io/badge/docker-ready-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)
[![Issues](https://img.shields.io/github/issues/ramsainanduri/cll_genie)](https://github.com/ramsainanduri/cll_genie/issues)

## Overview

`cll_genie` is a Flask-based web application for processing sequencing data and generating clinical reports. It automates the second stage of analysis and integrates with Clarity for final PDF report generation, including patient information.

---

## Table of Contents

- [Description](#description)
- [Features](#features)
- [Architecture](#architecture)
- [Workflow](#workflow)
- [Installation](#installation)
- [Who Built It?](#who-built-it)
- [License](#license)
- [Contact](#contact)

---

## Description

`cll_genie` provides a streamlined workflow for processing sequencing data and generating clinical reports. The application is designed to handle the second stage of analysis and reporting, integrating with Clarity for final PDF report generation including patient information.

---

## Features

- Web interface for secondary analysis, sample tracking, and managing lymphotrack Dx results
- Automated second-stage analysis of LymphoTrack Dx output
- Report generation and integration with Clarity for final PDF creation
- User authentication
- Dockerized deployment for easy setup

---

## Architecture

- **Frontend:** Flask templates (Jinja2), CSS3 and JavaScript for UI
- **Backend:** Flask, Python 3.11+
- **Database:** MongoDB
- **Containerization:** Docker support for reproducible deployments
- **CI/CD:** GitHub Actions

---

## Workflow

1. **Sequencing, Demultiplexing, and QC**  
   Prepare raw sequencing data by performing sequencing, demultiplexing, and quality control. The samples are then registered in the cll_genie database.

2. **Run LymphoTrack Dx Software**  
   Process FASTQ files using LymphoTrack Dx to generate first-stage results. This will output excel  file with all the results. And a text file with QC metrics. Thiese results are add to the samples that were registered in the cll_genie database.

3. **cll_genie**  
    Each sample is then analysed in the `cll_genie` application, The data is sent to IMGT-vquest server and the results are retrived. These secondary analysis results along with the subset information is displayed in the aplication. From here the user can create an HTML report without the patient information. The HTML report can be downloaded and sent to Clarity for final PDF report generation.
---

## Installation

### Prerequisites

- Python 3.11 or higher
- MongoDB installed and running
- `.env` file configured (see `.env.example`)
- Docker and `docker-compose` (optional, for containerized deployment)

### Quick Start

To install, simply run the provided shell script or use Docker Compose:


#### Using shell script
```bash
./scripts/install.sh
```

#### Or with Docker Compose
```bash
docker-compose up -d
```

### Clone the repository

```bash
git clone https://github.com/SMD-Bioinformatics-Lund/cll_genie.git
cd cll_genie
```
---
## Who Built It?

CLL Genie is developed and maintained by the bioinformaticians at Section for Molecular Diagnostics (SMD), Lund, in close collaboration with clinical geneticists. The system is in active use for diagnostics casework, variant interpretation, and report creation.

---

## License

© 2025 Section for Molecular Diagnostics (SMD), Lund.
All rights reserved. Internal use only.

---

## Contact

For inquiries, feedback, or deployment support, please contact the SMD development team at Lund.   
**Email:** ram.nanduri@skane.se  
**GitHub Issues:** [cll_genie/issues](https://github.com/SMD-Bioinformatics-Lund//cll_genie/issues)
  
  
  
  
