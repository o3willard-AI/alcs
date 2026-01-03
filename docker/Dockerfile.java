# Java Test Execution Environment
# Pre-configured with JDK 17, Maven, JUnit, and JaCoCo

FROM eclipse-temurin:17-jdk-jammy

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    maven \
    && rm -rf /var/lib/apt/lists/*

# Verify Maven installation
RUN mvn --version

# Create minimal Maven settings with JUnit and JaCoCo dependencies
RUN mkdir -p /home/testuser/.m2 && \
    echo '<?xml version="1.0" encoding="UTF-8"?>' > /tmp/settings.xml && \
    echo '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"' >> /tmp/settings.xml && \
    echo '          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' >> /tmp/settings.xml && \
    echo '          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0' >> /tmp/settings.xml && \
    echo '          http://maven.apache.org/xsd/settings-1.0.0.xsd">' >> /tmp/settings.xml && \
    echo '  <localRepository>/home/testuser/.m2/repository</localRepository>' >> /tmp/settings.xml && \
    echo '</settings>' >> /tmp/settings.xml

# Pre-download common Maven dependencies to speed up test execution
RUN mkdir -p /tmp/maven-warmup && \
    cd /tmp/maven-warmup && \
    echo '<?xml version="1.0" encoding="UTF-8"?>' > pom.xml && \
    echo '<project xmlns="http://maven.apache.org/POM/4.0.0"' >> pom.xml && \
    echo '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' >> pom.xml && \
    echo '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0' >> pom.xml && \
    echo '         http://maven.apache.org/xsd/maven-4.0.0.xsd">' >> pom.xml && \
    echo '  <modelVersion>4.0.0</modelVersion>' >> pom.xml && \
    echo '  <groupId>com.alcs</groupId>' >> pom.xml && \
    echo '  <artifactId>warmup</artifactId>' >> pom.xml && \
    echo '  <version>1.0.0</version>' >> pom.xml && \
    echo '  <properties>' >> pom.xml && \
    echo '    <maven.compiler.source>17</maven.compiler.source>' >> pom.xml && \
    echo '    <maven.compiler.target>17</maven.compiler.target>' >> pom.xml && \
    echo '    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>' >> pom.xml && \
    echo '  </properties>' >> pom.xml && \
    echo '  <dependencies>' >> pom.xml && \
    echo '    <dependency>' >> pom.xml && \
    echo '      <groupId>org.junit.jupiter</groupId>' >> pom.xml && \
    echo '      <artifactId>junit-jupiter</artifactId>' >> pom.xml && \
    echo '      <version>5.10.1</version>' >> pom.xml && \
    echo '      <scope>test</scope>' >> pom.xml && \
    echo '    </dependency>' >> pom.xml && \
    echo '  </dependencies>' >> pom.xml && \
    echo '  <build>' >> pom.xml && \
    echo '    <plugins>' >> pom.xml && \
    echo '      <plugin>' >> pom.xml && \
    echo '        <groupId>org.apache.maven.plugins</groupId>' >> pom.xml && \
    echo '        <artifactId>maven-surefire-plugin</artifactId>' >> pom.xml && \
    echo '        <version>3.2.2</version>' >> pom.xml && \
    echo '      </plugin>' >> pom.xml && \
    echo '      <plugin>' >> pom.xml && \
    echo '        <groupId>org.jacoco</groupId>' >> pom.xml && \
    echo '        <artifactId>jacoco-maven-plugin</artifactId>' >> pom.xml && \
    echo '        <version>0.8.11</version>' >> pom.xml && \
    echo '      </plugin>' >> pom.xml && \
    echo '    </plugins>' >> pom.xml && \
    echo '  </build>' >> pom.xml && \
    echo '</project>' >> pom.xml && \
    mvn dependency:resolve dependency:resolve-plugins && \
    cd / && rm -rf /tmp/maven-warmup

# Create non-root user for test execution
RUN useradd -m -u 1000 -s /bin/bash testuser && \
    chown -R testuser:testuser /home/testuser

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER testuser

# Copy Maven settings
COPY --chown=testuser:testuser /tmp/settings.xml /home/testuser/.m2/settings.xml

# Default command (can be overridden)
CMD ["/bin/bash"]

# Metadata
LABEL maintainer="ALCS Team"
LABEL description="Java test execution environment with JDK 17, Maven, and JUnit"
LABEL version="1.0.0"
