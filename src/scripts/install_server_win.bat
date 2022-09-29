call %~dp0\..\..\venv\Scripts\activate.bat
pip install --upgrade pip
pip install -r %~dp0\..\..\requirements.txt
pip install -e %~dp0\..\..
