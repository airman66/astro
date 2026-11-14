FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Planets.Api/Planets.Api.csproj Planets.Api/
RUN dotnet restore Planets.Api/Planets.Api.csproj
COPY Planets.Api/ Planets.Api/
RUN dotnet publish Planets.Api/Planets.Api.csproj -c Release --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish .
RUN mkdir -p /app/data && chown "$APP_UID" /app/data
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Planets.Api.dll"]
