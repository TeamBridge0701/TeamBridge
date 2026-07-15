package com.groupware.security;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.groupware.dto.EmployeeDTO;
import com.groupware.mapper.EmployeeMapper;

import lombok.RequiredArgsConstructor;

// Spring Security가 로그인 시도 시 자동으로 호출하는 클래스.
// "사번으로 유저를 찾아오는 방법"을 여기에 구현해두면, 나머지 인증 과정
// (비밀번호 비교, 세션 저장 등)은 Security가 알아서 처리한다.
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    // final 필드라서 생성자로만 값이 들어옴. @RequiredArgsConstructor(롬복)가
    // 이 필드를 받는 생성자를 자동으로 만들어주고, Spring이 그 생성자를 보고
    // EmployeeMapper 빈을 자동으로 주입해준다(생성자 직접 안 써도 됨).
    private final EmployeeMapper employeeMapper;

    // 메서드 이름은 UserDetailsService 인터페이스가 정한 대로 loadUserByUsername을
    // 그대로 써야 하지만, 파라미터 이름은 자유롭게 바꿔도 됨(인터페이스가 강제하는 건
    // 메서드 시그니처의 타입까지고, 파라미터 이름은 우리 마음대로).
    // 실제로 로그인 폼에서 입력한 사번(EMPLOYEE_NO)이 여기로 들어오므로 employeeNo로 명명.
    @Override
    public UserDetails loadUserByUsername(String employeeNo) throws UsernameNotFoundException {
        EmployeeDTO employeeDTO = employeeMapper.findByEmployeeNo(employeeNo);	// DB에서 사번으로 조회

        // 조회 결과가 없으면 이 예외를 던져야 함 -> Security가 이걸 받아서
        // "아이디(사번)가 존재하지 않음" 에러로 자동 처리해줌
        if (employeeDTO == null) {
            throw new UsernameNotFoundException("존재하지 않는 사번입니다: " + employeeNo);
        }

        // DB에서 가져온 EmployeeDTO를 Security가 이해하는 형태로 감싸서 반환
        return new CustomUserDetails(employeeDTO);
    }

}